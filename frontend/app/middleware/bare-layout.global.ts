// Pages that are a single question to answer, not pages of this app: they
// carry no navigation to wander off into. Everything else the catch-all serves
// keeps the full chrome, so the layout is set here rather than owned by the
// page — a page that switches the layout itself remounts the chrome, and with
// it the chat drawer's live conversation.
const BARE_PATHS = new Set(['/oauth/authorize', '/user/login', '/user/password'])

export default defineNuxtRouteMiddleware((to) => {
  if (BARE_PATHS.has(to.path)) setPageLayout('bare')
})
