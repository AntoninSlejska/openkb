import type { H3Event } from 'h3'
import { proxyRequest, getRouterParam, getRequestURL, createError } from 'h3'
import { drupalBaseUrl } from './drupal'

/**
 * Same-origin passthrough to Drupal for the media-library dialog.
 *
 * Drupal's dialog JS (loaded from the openkb_media_library CE route)
 * requests root-relative paths on the current origin — dialog content,
 * form submits, views AJAX, and the CSS/JS/derivative assets those
 * responses reference. The routes in server/routes/ forward exactly those
 * paths here; proxying keeps Drupal's JS unmodified (no CORS, no CSP).
 * Cookies pass through, so Drupal sees the shared session — the same auth
 * model as server/utils/drupal.ts.
 *
 * The POST paths (/media-library, /views/ajax and the media-widget view the
 * Grid/Table links lead to) are also listed in drupalCe.disableFormHandler
 * (nuxt.config.ts): nuxtjs-drupal-ce's global form-handler middleware would
 * otherwise consume every urlencoded or multipart POST body before this proxy
 * sees it.
 */

/**
 * The /core, /files, /modules, /sites and /themes prefixes serve the dialog
 * CSS/JS/fonts/images only — /core/install.php and friends stay off the app
 * origin.
 */
const STATIC_ASSET_EXT = /\.(?:css|js|mjs|map|json|woff2?|ttf|eot|otf|svg|png|jpe?g|gif|webp|avif|ico)$/i

/**
 * The router param as a path to append to a Drupal prefix: each segment fully
 * decoded, then percent-encoded, so `fetch` gets no tab, CR, LF, `#`, `?` or
 * `\` to strip or resolve. Undefined, i.e. refused:
 * - an empty, `.` or `..` segment; one trailing slash is fine
 * - a segment that decodes to one of those or holds a `/` or `\`
 */
export function drupalPath(param: string): string | undefined {
  const trailing = param.endsWith('/') ? '/' : ''
  const path = trailing ? param.slice(0, -1) : param
  if (path === '') return trailing ? undefined : ''
  const segments: string[] = []
  for (const segment of path.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    }
    catch {
      return undefined
    }
    if (/^\.{0,2}$/.test(decoded) || /[/\\]/.test(decoded)) return undefined
    segments.push(encodeURIComponent(decoded))
  }
  return segments.join('/') + trailing
}

/**
 * Proxies the request to `${base}/${prefix}/${path}${search}`, the path being
 * the route's `[...path]` param through {@link drupalPath}. 404 when that
 * refuses it and, with `assets`, for anything but a static asset.
 */
export function drupalPassthrough(event: H3Event, prefix: string, { assets = false } = {}) {
  const param = drupalPath(getRouterParam(event, 'path') ?? '')
  if (param === undefined || (assets && !STATIC_ASSET_EXT.test(param))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  const path = param ? `${prefix}/${param}` : prefix
  return proxyRequest(event, `${drupalBaseUrl()}/${path}${getRequestURL(event).search}`)
}
