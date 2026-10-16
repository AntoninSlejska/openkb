import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { atLeast, spaceAccessBySlug, spaceAccessMap } from './space-access'
import { makeEvent, stubFetch, type Reply } from '../test-support/h3'

/**
 * The frontend's copy of Drupal's access answer, and what happens when there
 * isn't one.
 *
 * The contract that matters is the failure: search enforces this map on the
 * index, so a map that cannot be read has to raise rather than resolve to
 * something a query could run with. The UI-facing reader is the other half —
 * it answers "nothing" instead, which hides a control rather than failing a
 * page.
 */

const SPACES = [
  { slug: 'team-wiki', name: 'Team Wiki', description: 'Notes.', access: 'manage', moderated: true },
  { slug: 'general', name: 'General', description: '', access: 'read', moderated: false },
]

/** Drupal's answer to every call: the fixture, unless `over` says otherwise. */
const reply = (over: Reply = {}) => stubFetch({ '': { body: { spaces: SPACES }, ...over } })

beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ drupalBaseUrl: 'http://drupal.test/' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('spaceAccessMap', () => {
  it('reads the map from Drupal as the caller', async () => {
    const calls = reply()
    expect(await spaceAccessMap(makeEvent())).toEqual(SPACES)
    expect(calls.map(call => call.url)).toEqual(['http://drupal.test/openkb/spaces'])
  })

  it('reads once per request, however many consumers ask', async () => {
    const calls = reply()
    const event = makeEvent()
    await Promise.all([spaceAccessMap(event), spaceAccessMap(event)])
    await spaceAccessMap(event)
    expect(calls).toHaveLength(1)
  })

  it('raises for an anonymous caller, without asking', async () => {
    const calls = reply()
    await expect(spaceAccessMap(makeEvent({}))).rejects.toMatchObject({ statusCode: 403 })
    expect(calls).toEqual([])
  })

  it('raises when Drupal is unreachable — never an empty answer', async () => {
    reply({ offline: true })
    await expect(spaceAccessMap(makeEvent())).rejects.toMatchObject({ statusCode: 503 })
  })

  it('raises when Drupal refuses the caller', async () => {
    reply({ status: 403 })
    await expect(spaceAccessMap(makeEvent())).rejects.toMatchObject({ statusCode: 403 })
  })

  it('raises on an answer that is not a space list', async () => {
    reply({ body: { error: 'nope' } })
    await expect(spaceAccessMap(makeEvent())).rejects.toMatchObject({ statusCode: 503 })
  })

  it('drops an entry carrying no slug or no known level', async () => {
    reply({
      body: {
        spaces: [
          { slug: '', name: 'Nameless', access: 'read' },
          { slug: 'odd', name: 'Odd', access: 'superuser' },
          SPACES[0],
        ],
      },
    })
    expect((await spaceAccessMap(makeEvent())).map(space => space.slug)).toEqual(['team-wiki'])
  })
})

describe('spaceAccessBySlug', () => {
  it('keys the map by slug', async () => {
    reply()
    const access = await spaceAccessBySlug(makeEvent())
    expect(access.get('team-wiki')?.access).toBe('manage')
    expect(access.get('general')?.access).toBe('read')
  })

  it('answers nothing rather than raising, so a control is hidden not broken', async () => {
    reply({ offline: true })
    expect(await spaceAccessBySlug(makeEvent())).toEqual(new Map())
  })
})

describe('atLeast', () => {
  it('orders the levels read < write < manage', () => {
    expect(atLeast('manage', 'write')).toBe(true)
    expect(atLeast('write', 'write')).toBe(true)
    expect(atLeast('read', 'write')).toBe(false)
    expect(atLeast('write', 'manage')).toBe(false)
  })
})
