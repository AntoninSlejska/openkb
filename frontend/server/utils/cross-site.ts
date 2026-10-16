/**
 * Whether a browser sent this request from a page of another site or origin.
 *
 * `Sec-Fetch-Site` decides when the browser sent it: only `same-origin` and
 * `none` (typed in, bookmarked) pass. Without it, `Origin` must name one of the
 * app's own hosts — the one the request reached (`X-Forwarded-Host` behind a
 * proxy, else `Host`) or the one in `DRUPAL_FRONTEND_BASE_URL`. A request with
 * neither header is no browser's, so not cross-site.
 */
export function isCrossSiteRequest(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site')
  if (site) {
    return site !== 'same-origin' && site !== 'none'
  }
  const origin = headers.get('origin')
  if (!origin) {
    return false
  }
  const host = hostOf(origin)
  return !host || !ownHosts(headers).includes(host)
}

function ownHosts(headers: Headers): string[] {
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const frontend = process.env.DRUPAL_FRONTEND_BASE_URL
  return [forwarded, headers.get('host'), frontend ? hostOf(frontend) : null]
    .filter((host): host is string => !!host)
    .map(host => host.toLowerCase())
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  }
  catch {
    return null
  }
}
