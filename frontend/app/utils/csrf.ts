/**
 * Drupal's CSRF token for the browser's session, sent on every
 * cookie-authenticated write (ADR 0019).
 *
 * - Read once per page load: sign-in and sign-out are full page loads.
 * - Browser only: a server-side render has no session to read it for.
 */

let token: Promise<string> | undefined

export function csrfToken(): Promise<string> {
  token ??= $fetch<string>('/session/token', { responseType: 'text' }).catch((err) => {
    token = undefined
    throw err
  })
  return token
}

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

/** `$fetch` for a write: carries the CSRF token. */
export async function csrfFetch<T>(url: string, options: FetchOptions): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('X-CSRF-Token', await csrfToken())
  return await $fetch<T>(url, { ...options, headers })
}
