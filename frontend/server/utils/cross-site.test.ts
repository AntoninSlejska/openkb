import { afterEach, describe, it, expect, vi } from 'vitest'
import { isCrossSiteRequest } from './cross-site'

afterEach(() => {
  vi.unstubAllEnvs()
})

function headers(values: Record<string, string>): Headers {
  return new Headers({ host: 'node1.kb.test:8091', ...values })
}

describe('with Sec-Fetch-Site', () => {
  it('passes same-origin and none, whatever Origin says', () => {
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'same-origin', 'origin': 'https://kb.example.com' }))).toBe(false)
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'none' }))).toBe(false)
  })

  it('refuses same-site and cross-site', () => {
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'same-site' }))).toBe(true)
    expect(isCrossSiteRequest(headers({ 'sec-fetch-site': 'cross-site', 'origin': 'http://node1.kb.test:8091' }))).toBe(true)
  })
})

describe('with Origin only', () => {
  it('passes no Origin', () => {
    expect(isCrossSiteRequest(headers({}))).toBe(false)
  })

  it('passes the host the request reached', () => {
    expect(isCrossSiteRequest(headers({ origin: 'http://node1.kb.test:8091' }))).toBe(false)
  })

  it('passes the forwarded host behind a proxy', () => {
    expect(isCrossSiteRequest(headers({ 'origin': 'https://kb.example.com', 'x-forwarded-host': 'kb.example.com' }))).toBe(false)
  })

  it('passes the frontend base URL', () => {
    vi.stubEnv('DRUPAL_FRONTEND_BASE_URL', 'https://kb.example.com/')
    expect(isCrossSiteRequest(headers({ origin: 'https://kb.example.com' }))).toBe(false)
  })

  it('refuses another host, another port and a null Origin', () => {
    for (const origin of ['https://evil.test', 'http://node1.kb.test:9999', 'null']) {
      expect(isCrossSiteRequest(headers({ origin })), origin).toBe(true)
    }
  })
})
