import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener, type EventHandler, type H3Event } from 'h3'
import { drupalPath } from './drupal-proxy'
import core from '../routes/core/[...path].get'
import files from '../routes/files/[...path].get'
import modules from '../routes/modules/[...path].get'
import sites from '../routes/sites/[...path].get'
import themes from '../routes/themes/[...path].get'
import mediaWidget from '../routes/admin/content/media-widget/[...path]'
import mediaWidgetTable from '../routes/admin/content/media-widget-table/[...path]'
import mediaLibrary from '../routes/media-library'
import viewsAjax from '../routes/views/ajax'

/**
 * The media-library dialog passthroughs: where each one forwards, and that a
 * path which would resolve outside its prefix never leaves the app.
 */

const DRUPAL = 'http://drupal.test'
const proxyRequest = vi.fn()

vi.mock('./drupal', () => ({ drupalBaseUrl: () => DRUPAL }))
vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, proxyRequest: (...a: unknown[]) => proxyRequest(...a) }
})

/** An event as the router hands it over: the raw URL plus the `[...path]` param. */
function event(url: string, param?: string): H3Event {
  return {
    path: url,
    method: 'GET',
    context: { params: param === undefined ? {} : { path: param } },
    node: { req: { url, method: 'GET', headers: { host: 'app.test' } } },
  } as unknown as H3Event
}

/** Runs a handler, a synchronous throw included, as a promise. */
async function run(handler: EventHandler, e: H3Event): Promise<unknown> {
  return handler(e)
}

const CATCH_ALL: [string, EventHandler, string, string][] = [
  ['/core', core, 'misc/dialog.css', 'core/misc/dialog.css'],
  ['/files', files, 'styles/thumb/a.png', 'files/styles/thumb/a.png'],
  ['/modules', modules, 'contrib/x/x.js', 'modules/contrib/x/x.js'],
  ['/sites', sites, 'default/files/a.jpg', 'sites/default/files/a.jpg'],
  ['/themes', themes, 'claro/css/a.css', 'themes/claro/css/a.css'],
  ['/admin/content/media-widget', mediaWidget, 'image', 'admin/content/media-widget/image'],
  ['/admin/content/media-widget-table', mediaWidgetTable, 'image', 'admin/content/media-widget-table/image'],
]

beforeEach(() => {
  proxyRequest.mockReset().mockImplementation((_event, target: string) => target)
})

describe('drupalPath', () => {
  it.each([
    ['', ''], ['a', 'a'], ['a/b.css', 'a/b.css'], ['a/', 'a/'], ['a..b/c', 'a..b/c'],
    ['files/a%20b.png', 'files/a%20b.png'], ['a b.png', 'a%20b.png'], ['café', 'caf%C3%A9'],
    // As the router hands them over: decoded but for `%25` and `%2F`.
    ['.\t./x', '.%09./x'], ['.\n./x', '.%0A./x'], ['.\r./x', '.%0D./x'],
    ['install.php#.js', 'install.php%23.js'], ['a?b', 'a%3Fb'], ['%252e%252e', '%252e%252e'], ['a%25b', 'a%25b'],
  ])('forwards %j as %j', (param, path) => {
    expect(drupalPath(param)).toBe(path)
  })

  it.each([
    '..', 'a/../b', '.', 'a/./b', 'a//b', '/a', '/',
    '%2e%2e/b', 'a/%2E%2e/b', '%2e', 'a%2F..%2Fb', 'a%5c..%5cb', 'a\\..\\b', '%E0%A4%A',
  ])('refuses %j', (param) => {
    expect(drupalPath(param)).toBeUndefined()
  })
})

describe.each(CATCH_ALL)('%s/**', (prefix, handler, param, target) => {
  it('forwards to the prefix plus the router param, query included', async () => {
    await expect(run(handler, event(`${prefix}/${param}?v=1`, param))).resolves.toBe(`${DRUPAL}/${target}?v=1`)
  })

  it('builds the target from the router param, not from the request URL', async () => {
    // A request URL the router matched under the prefix that would resolve elsewhere.
    await run(handler, event(`${prefix}/../../user/1/${param}`, param))
    expect(proxyRequest).toHaveBeenCalledWith(expect.anything(), `${DRUPAL}/${target}`)
  })

  it.each(['../user/1', `x/%2e%2e/../${param}`])('answers 404 for %j', async (bad) => {
    await expect(run(handler, event(`${prefix}/${bad}`, bad))).rejects.toMatchObject({ statusCode: 404 })
    expect(proxyRequest).not.toHaveBeenCalled()
  })
})

describe.each(CATCH_ALL.filter(([prefix]) => !prefix.startsWith('/admin/')))('%s/** (static assets)', (prefix, handler) => {
  it('answers 404 for anything but a static asset', async () => {
    await expect(run(handler, event(`${prefix}/install.php`, 'install.php'))).rejects.toMatchObject({ statusCode: 404 })
    expect(proxyRequest).not.toHaveBeenCalled()
  })
})

describe.each([
  ['/media-library', mediaLibrary],
  ['/views/ajax', viewsAjax],
] as [string, EventHandler][])('%s', (path, handler) => {
  it('forwards to its own path, query included', async () => {
    await expect(run(handler, event(`${path}?_wrapper_format=drupal_ajax`))).resolves.toBe(`${DRUPAL}${path}?_wrapper_format=drupal_ajax`)
  })
})

/**
 * Through a real h3 router and raw HTTP: the param arrives decoded, so what
 * `fetch` would send must stay under the prefix exactly as built.
 */
describe('through the router', () => {
  let server: Server
  let port: number

  beforeAll(async () => {
    const router = createRouter()
    for (const [prefix, handler] of CATCH_ALL) router.use(`${prefix}/**:path`, handler)
    const app = createApp()
    app.use(router)
    server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  /** Sends the request line as is; resolves to the status and body. */
  function get(path: string): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.write(`GET ${path} HTTP/1.0\r\nHost: app.test\r\n\r\n`))
      let data = ''
      socket.on('data', (chunk) => { data += chunk })
      socket.on('end', () => {
        const [head = '', body = ''] = data.split('\r\n\r\n')
        resolve({ status: Number(head.split(' ')[1]), body })
      })
      socket.on('error', reject)
    })
  }

  it.each([
    ['/admin/content/media-widget', '.%09./.%09./.%09./user/1/edit'],
    ['/admin/content/media-widget', '.%0a./.%0d./user/1/edit'],
    ['/core', '.%09./.%09./user/1/edit%23.js'],
    ['/core', 'install.php%23.js'],
    ['/core', 'rebuild.php%23.js'],
    ['/files', '%252e%252e/%252e%252e/user/1.png'],
  ])('%s/%s stays under the prefix', async (prefix, attack) => {
    const { status, body } = await get(`${prefix}/${attack}`)
    if (status === 404) return
    expect(status).toBe(200)
    const sent = new URL(body)
    expect(sent.href).toBe(body)
    expect(sent.pathname.startsWith(`${prefix}/`)).toBe(true)
    expect(sent.hash).toBe('')
  })

  it('forwards a plain asset', async () => {
    expect(await get('/core/misc/dialog.css?v=1')).toEqual({ status: 200, body: `${DRUPAL}/core/misc/dialog.css?v=1` })
  })
})
