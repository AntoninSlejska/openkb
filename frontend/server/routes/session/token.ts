import { createError, defineEventHandler, isMethod, setResponseHeader } from 'h3'
import { drupalPassthrough } from '../../utils/drupal-proxy'

// Drupal's CSRF token for the browser's session, same-origin only (ADR 0019).
// - Other methods get 405 here, not the CE catch-all.
export default defineEventHandler((event) => {
  if (!isMethod(event, ['GET', 'HEAD'])) {
    setResponseHeader(event, 'Allow', 'GET, HEAD')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }
  return drupalPassthrough(event, 'session/token')
})
