import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

async function load() {
  vi.resetModules()
  return await import('./csrf')
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => url === '/session/token' ? 'browser-token' : { ok: true })
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('csrfFetch', () => {
  it('sends the session\'s token with the write', async () => {
    const { csrfFetch } = await load()
    await csrfFetch('/api/node/1', { method: 'DELETE' })
    const [url, options] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe('/api/node/1')
    expect(options.method).toBe('DELETE')
    expect(new Headers(options.headers).get('x-csrf-token')).toBe('browser-token')
  })

  it('reads the token once per page load', async () => {
    const { csrfFetch } = await load()
    await csrfFetch('/api/node/1', { method: 'DELETE' })
    await csrfFetch('/api/node/2', { method: 'DELETE' })
    expect(fetchMock.mock.calls.filter(([url]) => url === '/session/token')).toHaveLength(1)
  })

  it('reads the token again after a failed read', async () => {
    const { csrfToken } = await load()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(csrfToken()).rejects.toThrow('offline')
    await expect(csrfToken()).resolves.toBe('browser-token')
  })
})
