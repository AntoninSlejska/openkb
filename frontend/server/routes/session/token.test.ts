import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'
import handler from './token'

const passthrough = vi.fn()
vi.mock('../../utils/drupal-proxy', () => ({ drupalPassthrough: (...a: unknown[]) => passthrough(...a) }))

function event(method: string): H3Event & { headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  const e = {
    path: '/session/token',
    method,
    context: {},
    node: {
      req: { url: '/session/token', method, headers: { cookie: 'SSESSabc=1' } },
      res: { setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value }, statusCode: 200 },
    },
    headers,
  }
  return e as unknown as H3Event & { headers: Record<string, string> }
}

describe('/session/token', () => {
  beforeEach(() => {
    passthrough.mockReset().mockResolvedValue('the-token')
  })

  it.each(['GET', 'HEAD'])('relays %s to Drupal', async (method) => {
    const e = event(method)
    await expect(handler(e)).resolves.toBe('the-token')
    expect(passthrough).toHaveBeenCalledWith(e, 'session/token')
  })

  it.each(['POST', 'OPTIONS', 'PUT', 'DELETE'])('answers %s with 405 and Allow', (method) => {
    const e = event(method)
    expect(() => handler(e)).toThrow(expect.objectContaining({ statusCode: 405 }))
    expect(e.headers.allow).toBe('GET, HEAD')
    expect(passthrough).not.toHaveBeenCalled()
  })
})
