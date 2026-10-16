import { createError, defineEventHandler, getHeader } from 'h3'
import { isCrossSiteRequest } from '../utils/cross-site'

/**
 * Refuses a write a page of another site sent, on every path (ADR 0019).
 *
 * - Comes on top of the CSRF token, for the writes no token covers: Drupal's
 *   login form carries no form token for anonymous users, so a cross-site
 *   `POST /user/login` would log the victim into the attacker's account.
 * - Bearer callers with no cookie carry no ambient credential and pass.
 * - `/register` is cross-site by design: cookie-less OAuth client
 *   registration, open to any origin.
 */

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  if (READS.has(event.method) || event.path.split('?')[0] === '/register') {
    return
  }
  const bearerOnly = !getHeader(event, 'cookie') && /^Bearer\s/i.test(getHeader(event, 'authorization') ?? '')
  if (bearerOnly || !isCrossSiteRequest(event.headers)) {
    return
  }
  throw createError({ statusCode: 403, statusMessage: 'A cross-site write is refused' })
})
