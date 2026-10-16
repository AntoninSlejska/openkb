import { Readable } from 'node:stream'
import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { readCappedBody } from './capped-body'

/** A request streaming `chunks`, recording how many of them were pulled. */
function request(chunks: Buffer[], headers: Record<string, string> = {}) {
  let pulled = 0
  const req = new Readable({
    read() {
      this.push(pulled < chunks.length ? chunks[pulled++] : null)
    },
  })
  Object.assign(req, { headers })
  const res = { setHeader: () => {} }
  return { event: { node: { req, res } } as unknown as H3Event, pulled: () => pulled }
}

const KB = Buffer.alloc(1024, 'a')

describe('readCappedBody', () => {
  it('answers a body within the cap', async () => {
    const { event } = request([Buffer.from('{"a":'), Buffer.from('1}')])
    expect((await readCappedBody(event, 64)).toString()).toBe('{"a":1}')
  })

  it('refuses a declared length over the cap before reading', async () => {
    const { event, pulled } = request([KB], { 'content-length': '1025' })
    await expect(readCappedBody(event, 1024)).rejects.toMatchObject({ statusCode: 413 })
    expect(pulled()).toBe(0)
  })

  it('reads and drops the rest of an oversized chunked body, then refuses it', async () => {
    const { event, pulled } = request(Array.from({ length: 1000 }, () => KB))
    await expect(readCappedBody(event, 4 * 1024)).rejects.toMatchObject({ statusCode: 413 })
    expect(pulled()).toBe(1000)
  })

  it('answers an empty body as empty', async () => {
    const { event } = request([])
    expect((await readCappedBody(event, 64)).byteLength).toBe(0)
  })
})
