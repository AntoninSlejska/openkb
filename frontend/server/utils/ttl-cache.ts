/**
 * A map whose entries lapse `ttlMs` after they are set.
 *
 * A lapsed entry is dropped when it is read, and {@link sweep} drops the ones
 * nobody reads again — keys can be one-off (a cookie per session).
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V, expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
  }

  sweep(): void {
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
