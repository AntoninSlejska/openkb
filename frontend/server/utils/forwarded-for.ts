import { getRequestHeader, type H3Event } from 'h3'

/**
 * X-Forwarded-For for a request relayed to Drupal: the incoming chain plus
 * the socket peer. Drupal trusts this server as a proxy, so its flood control
 * keys on the client instead of on this server.
 * - Node reports IPv4 peers IPv6-mapped; Drupal's trusted subnets are IPv4.
 */
export function forwardedFor(event: H3Event): Record<string, string> {
  const peer = event.node.req.socket?.remoteAddress?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')
  const chain = [getRequestHeader(event, 'x-forwarded-for'), peer].filter(Boolean).join(', ')
  return chain ? { 'X-Forwarded-For': chain } : {}
}
