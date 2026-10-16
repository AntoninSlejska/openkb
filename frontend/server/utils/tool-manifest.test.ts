import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Drupal's tool manifest as the MCP server reads it: how often Drupal is
 * asked, how an unchanged answer is revalidated, and what an unreadable one
 * does. Every request to Drupal is recorded, so "a fresh entry costs nothing"
 * is a count.
 */

/**
 * Nitro's cache as `swr: false` behaves: an entry is served until `maxAge`
 * runs out, then the function runs again and its error reaches the caller.
 */
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (
    fn: () => Promise<unknown>,
    opts: { maxAge: number, getKey: () => string },
  ) => {
    const entries = new Map<string, { value: unknown, expires: number }>()
    return async () => {
      const key = opts.getKey()
      const entry = entries.get(key)
      if (entry && entry.expires > Date.now()) return entry.value
      const value = await fn()
      entries.set(key, { value, expires: Date.now() + opts.maxAge * 1000 })
      return value
    }
  },
}))
vi.mock('./drupal', () => ({ drupalBaseUrl: () => 'http://drupal.test' }))

const ETAG = '"a8950d3a83c8e36f0f8d907d11affec7"'
const LAST_MODIFIED = 'Wed, 30 Sep 2026 12:01:59 GMT'

/** One request made to Drupal. */
interface Wire {
  url: string
  ifNoneMatch: string | null
  ifModifiedSince: string | null
}

let wire: Wire[] = []
/** What Drupal answers next; the default is the manifest, validators set. */
let answer: () => Response

function manifest(names: string[]): Response {
  return new Response(JSON.stringify({ tools: names.map(name => ({ name })) }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': ETAG, 'last-modified': LAST_MODIFIED },
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  wire = []
  answer = () => manifest(['get_page_for_editing', 'update_blocks'])
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    wire.push({ url, ifNoneMatch: headers.get('if-none-match'), ifModifiedSince: headers.get('if-modified-since') })
    return answer()
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function load() {
  return (await import('./tool-manifest')).enabledSessionTools
}

describe('tool manifest', () => {
  it('reads the enabled session tools from Drupal', async () => {
    const enabledSessionTools = await load()

    expect(await enabledSessionTools()).toEqual(new Set(['get_page_for_editing', 'update_blocks']))
    expect(wire).toEqual([{ url: 'http://drupal.test/openkb/agent/tool-manifest', ifNoneMatch: null, ifModifiedSince: null }])
  })

  it('asks Drupal nothing while the entry is fresh', async () => {
    const enabledSessionTools = await load()
    await enabledSessionTools()
    vi.advanceTimersByTime(59_000)
    await enabledSessionTools()
    await enabledSessionTools()

    expect(wire).toHaveLength(1)
  })

  it('revalidates an expired entry, and a 304 keeps the last answer', async () => {
    const enabledSessionTools = await load()
    await enabledSessionTools()
    vi.advanceTimersByTime(61_000)
    answer = () => new Response(null, { status: 304 })

    expect(await enabledSessionTools()).toEqual(new Set(['get_page_for_editing', 'update_blocks']))
    expect(wire[1]).toMatchObject({ ifNoneMatch: ETAG, ifModifiedSince: LAST_MODIFIED })
  })

  it('takes a changed answer once the entry expired', async () => {
    const enabledSessionTools = await load()
    await enabledSessionTools()
    vi.advanceTimersByTime(61_000)
    answer = () => manifest(['get_page_for_editing'])

    expect(await enabledSessionTools()).toEqual(new Set(['get_page_for_editing']))
  })

  it.each([
    ['Drupal refuses', () => new Response('', { status: 503 })],
    ['Drupal answers something else', () => new Response('{}', { status: 200 })],
  ])('is an error, never a guess, when %s after the entry expired', async (_label, failure) => {
    const enabledSessionTools = await load()
    await enabledSessionTools()
    vi.advanceTimersByTime(61_000)
    answer = failure

    await expect(enabledSessionTools()).rejects.toThrow('tool manifest')
  })

  it('is an error when Drupal cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    const enabledSessionTools = await load()

    await expect(enabledSessionTools()).rejects.toMatchObject({ statusCode: 503 })
  })
})
