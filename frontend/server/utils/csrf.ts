import { createHash, timingSafeEqual } from 'node:crypto'
import { defineCachedFunction } from 'nitropack/runtime'
import { fetchCsrfToken } from './drupal'

/** How long Drupal's token for a Cookie header is kept, in seconds. */
const TOKEN_MAX_AGE = 30 * 60

/**
 * Drupal's CSRF token for a Cookie header, cached for 30 minutes.
 *
 * - Keyed by the sha256 of the Cookie header: the raw cookie is a secret.
 * - No invalidation: a session's token does not change, and sign-out ends the session.
 * - Stored in the `csrf-token` mount (nuxt.config.ts): a bounded in-memory LRU, so
 *   random cookies cannot grow memory.
 * - An empty answer is not stored, so the next call asks Drupal again.
 */
const cachedToken = defineCachedFunction(
  async (cookie: string, _key: string): Promise<string | undefined> => await fetchCsrfToken(cookie) || undefined,
  {
    base: 'csrf-token',
    name: 'csrf-token',
    maxAge: TOKEN_MAX_AGE,
    swr: false,
    getKey: (_cookie: string, key: string) => key,
    validate: entry => !!entry.value,
  },
)

/**
 * Whether `token`, as the caller sent it, is Drupal's CSRF token for the
 * caller's session `cookie` (ADR 0019).
 */
export async function isSessionCsrfToken(cookie: string, token: string | undefined): Promise<boolean> {
  if (!token) return false
  const expected = await cachedToken(cookie, createHash('sha256').update(cookie).digest('hex'))
  if (!expected) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
