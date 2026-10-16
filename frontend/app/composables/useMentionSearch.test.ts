// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useMentionSearch } from './useMentionSearch'

describe('useMentionSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onScopeDispose', onScopeDispose)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('searches once the typing pauses', async () => {
    const fetch = vi.fn(async () => Response.json({ users: [{ uid: 3, name: 'Ada' }] }))
    vi.stubGlobal('fetch', fetch)
    const scope = effectScope()
    const search = scope.run(() => useMentionSearch())!

    search.mentionQuery.value = 'a'
    await nextTick()
    search.mentionQuery.value = 'ad'
    await nextTick()
    await vi.advanceTimersByTimeAsync(120)

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/users/search?q=ad', expect.anything())
    expect(search.mentionItems.value).toEqual([{ label: 'Ada', id: 3 }])
    scope.stop()
  })

  it('disposal clears the pending search', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const scope = effectScope()
    const search = scope.run(() => useMentionSearch())!

    search.mentionQuery.value = 'ad'
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposal aborts the request in flight', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise(() => {})
    }))
    const scope = effectScope()
    const search = scope.run(() => useMentionSearch())!

    search.mentionQuery.value = 'ad'
    await nextTick()
    await vi.advanceTimersByTimeAsync(120)
    expect(signal?.aborted).toBe(false)

    scope.stop()

    expect(signal?.aborted).toBe(true)
  })
})
