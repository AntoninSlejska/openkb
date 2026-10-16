// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import * as Y from 'yjs'
import { useLiveCollab } from './useLiveCollab'

const providers: Array<{ options: { onSynced: () => void }, destroy: ReturnType<typeof vi.fn> }> = []

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    destroy = vi.fn()
    constructor(public options: { onSynced: () => void }) { providers.push(this) }
  },
}))
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    destroy = vi.fn()
    clearData = vi.fn(async () => {})
  },
}))

/** Runs the composable inside a mounted component, as the editor does. */
function mounted(ydoc: Y.Doc) {
  const app = createApp(defineComponent({
    setup() {
      useLiveCollab({ ydoc, name: 'node:1', localKey: 'openkb-node-1' })
      return () => h('div')
    },
  }))
  app.mount(document.createElement('div'))
  return () => app.unmount()
}

/** The doc's 'update' listeners — lib0's observable keeps them in a map. */
function updateListeners(ydoc: Y.Doc): number {
  return (ydoc as unknown as { _observers: Map<string, Set<unknown>> })._observers.get('update')?.size ?? 0
}

describe('useLiveCollab disposal', () => {
  beforeEach(() => {
    providers.length = 0
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('onMounted', onMounted)
    vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
    vi.stubGlobal('csrfToken', async () => 'browser-token')
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('destroys the provider on unmount and leaves the doc to its owner', () => {
    const ydoc = new Y.Doc()
    const destroyed = vi.fn()
    ydoc.on('destroy', destroyed)
    const unmount = mounted(ydoc)

    unmount()

    expect(providers[0]!.destroy).toHaveBeenCalled()
    expect(destroyed).not.toHaveBeenCalled()
  })

  it('drops the mirror re-creation listener a checkpoint left on the doc', async () => {
    const ydoc = new Y.Doc()
    const unmount = mounted(ydoc)
    const before = updateListeners(ydoc)
    providers[0]!.options.onSynced()

    // A confirmed checkpoint clears the mirror and arms the re-creation.
    ydoc.getMap('_meta').set('last_commit', { at: 1 })
    await vi.waitFor(() => expect(updateListeners(ydoc)).toBe(before + 1))

    unmount()

    expect(updateListeners(ydoc)).toBe(0)
  })
})
