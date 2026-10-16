import { describe, it, expect } from 'vitest'
import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  it('answers an entry until it lapses, then drops it on read', () => {
    let now = 0
    const cache = new TtlCache<string, number>(1000, () => now)
    cache.set('a', 1)

    now = 999
    expect(cache.get('a')).toBe(1)
    now = 1000
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('sweep drops the lapsed entries nobody reads again and keeps the live ones', () => {
    let now = 0
    const cache = new TtlCache<string, number>(1000, () => now)
    cache.set('old', 1)
    now = 500
    cache.set('new', 2)

    now = 1200
    cache.sweep()
    expect(cache.size).toBe(1)
    expect(cache.get('new')).toBe(2)
  })

  it('a set restarts the entry\'s lifetime', () => {
    let now = 0
    const cache = new TtlCache<string, number>(1000, () => now)
    cache.set('a', 1)
    now = 900
    cache.set('a', 2)
    now = 1500
    expect(cache.get('a')).toBe(2)
  })
})
