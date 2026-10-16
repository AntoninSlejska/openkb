import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Nitro's cache as `swr: false` behaves: an entry is served until `maxAge`
 * runs out, and an answer `validate` refuses is not stored.
 */
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <A extends unknown[]>(
    fn: (...args: A) => Promise<unknown>,
    opts: { maxAge: number, getKey: (...args: A) => string, validate: (entry: { value: unknown }) => boolean },
  ) => {
    const entries = new Map<string, { value: unknown, expires: number }>()
    return async (...args: A) => {
      const key = opts.getKey(...args)
      const entry = entries.get(key)
      if (entry && entry.expires > Date.now()) return entry.value
      const value = await fn(...args)
      if (opts.validate({ value })) entries.set(key, { value, expires: Date.now() + opts.maxAge * 1000 })
      return value
    }
  },
}))

const drupalToken = vi.fn<(cookie: string) => Promise<string | null>>()
vi.mock('./drupal', () => ({ fetchCsrfToken: (cookie: string) => drupalToken(cookie) }))

const { isSessionCsrfToken } = await import('./csrf')

beforeEach(() => {
  drupalToken.mockReset()
  drupalToken.mockImplementation(async cookie => `token-of-${cookie}`)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Drupal\'s token for a session', () => {
  it('is asked once for two writes in one session', async () => {
    expect(await isSessionCsrfToken('SESSa=1', 'token-of-SESSa=1')).toBe(true)
    expect(await isSessionCsrfToken('SESSa=1', 'token-of-SESSa=1')).toBe(true)
    expect(drupalToken).toHaveBeenCalledTimes(1)
  })

  it('is not shared between two sessions', async () => {
    expect(await isSessionCsrfToken('SESSb=1', 'token-of-SESSb=1')).toBe(true)
    expect(await isSessionCsrfToken('SESSb=2', 'token-of-SESSb=1')).toBe(false)
    expect(drupalToken.mock.calls).toEqual([['SESSb=1'], ['SESSb=2']])
  })

  it('is asked again after a failed answer', async () => {
    drupalToken.mockResolvedValueOnce(null)
    expect(await isSessionCsrfToken('SESSc=1', 'token-of-SESSc=1')).toBe(false)
    expect(await isSessionCsrfToken('SESSc=1', 'token-of-SESSc=1')).toBe(true)
    expect(drupalToken).toHaveBeenCalledTimes(2)
  })

  it('is asked again after 30 minutes', async () => {
    vi.useFakeTimers()
    await isSessionCsrfToken('SESSd=1', 'token-of-SESSd=1')
    vi.advanceTimersByTime(29 * 60 * 1000)
    await isSessionCsrfToken('SESSd=1', 'token-of-SESSd=1')
    expect(drupalToken).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2 * 60 * 1000)
    await isSessionCsrfToken('SESSd=1', 'token-of-SESSd=1')
    expect(drupalToken).toHaveBeenCalledTimes(2)
  })

  it('is not asked when the caller sent no token', async () => {
    expect(await isSessionCsrfToken('SESSe=1', undefined)).toBe(false)
    expect(drupalToken).not.toHaveBeenCalled()
  })
})
