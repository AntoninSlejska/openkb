import { createError, getRequestHeader, setResponseHeader, type H3Event } from 'h3'

/** How long the rest of an oversized body is read and dropped before the 413. */
const DISCARD_MS = 10_000

/**
 * The request body, refused with a 413 once it passes `maxBytes`.
 *
 * - A declared Content-Length over the cap is refused before reading.
 * - A chunked body is counted as it arrives. Past the cap, the rest is read
 *   and dropped for up to {@link DISCARD_MS}, then the 413 goes out: closing
 *   on an unread body resets the connection before the client reads it.
 */
export async function readCappedBody(event: H3Event, maxBytes: number): Promise<Buffer> {
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > maxBytes) {
    setResponseHeader(event, 'connection', 'close')
    throw tooLarge(maxBytes)
  }
  const req = event.node.req
  if (req.readableEnded) return Buffer.alloc(0)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size <= maxBytes) {
        chunks.push(chunk)
        return
      }
      req.off('data', onData).off('end', onEnd)
      chunks.length = 0
      setResponseHeader(event, 'connection', 'close')
      const timer = setTimeout(refuse, DISCARD_MS)
      req.once('end', refuse).once('close', refuse).resume()
      function refuse() {
        clearTimeout(timer)
        reject(tooLarge(maxBytes))
      }
    }
    const onEnd = () => resolve(Buffer.concat(chunks))
    req.on('data', onData).once('end', onEnd).once('error', reject)
  })
}

function tooLarge(maxBytes: number) {
  return createError({ statusCode: 413, statusMessage: `A body is at most ${maxBytes} bytes` })
}
