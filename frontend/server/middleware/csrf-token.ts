import { createError, defineEventHandler, getHeader } from 'h3'
import { isSessionCsrfToken } from '../utils/csrf'

/**
 * Refuses a cookie-authenticated `/api/*` write without the session's CSRF
 * token, before any route acts on it (ADR 0019).
 *
 * - The token is the one the browser sent; routes forward it to Drupal.
 * - A request without a cookie, or with a Bearer token, carries no ambient
 *   credential and passes.
 * - {@link DRUPAL_CHECKED} routes pass: Drupal checks the token they forward,
 *   and they only read before forwarding.
 */

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Writes whose token Drupal checks, as method and path.
 *
 * A route belongs here only when every Drupal write it makes checks the token
 * (`_csrf_request_header_token` or JSON:API) and it writes nothing itself.
 */
const DRUPAL_CHECKED: ReadonlyArray<readonly [string, RegExp]> = [
  ['POST', /^\/api\/chat$/],
  ['POST', /^\/api\/kb$/],
  ['POST', /^\/api\/node\/\d+\/(?:space|validate)$/],
  ['POST', /^\/api\/spaces$/],
  ['PATCH', /^\/api\/spaces\/[^/]+(?:\/outline)?$/],
]

function isDrupalChecked(method: string, path: string): boolean {
  const pathname = path.split('?')[0]!
  return DRUPAL_CHECKED.some(([m, pattern]) => m === method && pattern.test(pathname))
}

export default defineEventHandler(async (event) => {
  if (READS.has(event.method) || !event.path.startsWith('/api/')) {
    return
  }
  const cookie = getHeader(event, 'cookie')
  if (!cookie || /^Bearer\s/i.test(getHeader(event, 'authorization') ?? '')) {
    return
  }
  if (isDrupalChecked(event.method, event.path)) {
    return
  }
  if (!await isSessionCsrfToken(cookie, getHeader(event, 'x-csrf-token'))) {
    throw createError({ statusCode: 403, statusMessage: 'A write needs the session\'s CSRF token' })
  }
})
