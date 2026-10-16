// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { App } from 'vue'
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { Selection } from '@tiptap/pm/state'
import { buildCommitSchemaExtensions } from '~~/server/utils/editor-schema'
import { parseMarkdownToJson } from '~/comark/markdown-engine'
import { LinkTargetKeys, requestLinkBubble } from '~/editor/link-target'
import type { ResolvedTarget } from '~/composables/useDocLinkSearch'
import LinkTargetBubble from './LinkTargetBubble.vue'

// The bubble's content without the floating plugin around it.
vi.mock('@tiptap/vue-3/menus', () => ({
  BubbleMenu: { setup: (_props: unknown, { slots }: { slots: { default?: () => unknown } }) => () => h('div', slots.default?.()) },
}))

let editor: Editor
let root: HTMLElement
let peer: Editor | undefined
let app: App | undefined

/**
 * The bubble over the first `type` node of `markdown`, its page resolved to
 * `resolved`. For `link`, the caret goes inside the first link.
 */
async function mount(markdown: string, type: string, resolved: ResolvedTarget | null): Promise<HTMLElement> {
  editor = new Editor({ extensions: [...buildCommitSchemaExtensions(), LinkTargetKeys], content: parseMarkdownToJson(markdown) })
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && (node.type.name === type || node.marks.some(mark => mark.type.name === type))) at = pos
  })
  const { doc } = editor.state
  editor.view.dispatch(editor.state.tr.setSelection(type === 'link' ? TextSelection.create(doc, at + 1) : NodeSelection.create(doc, at)))
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(LinkTargetBubble as never, { editor, resolve: async () => resolved }) })
  app.component('UButton', { props: ['to', 'icon'], setup: (props, { attrs }) => () => h(props.to ? 'a' : 'button', { ...attrs, href: props.to }) })
  app.component('UInput', { setup: () => () => h('input') })
  app.mount(root)
  await vi.waitFor(async () => {
    await nextTick()
    expect(root.textContent).not.toContain('Loading')
  })
  return root
}

/**
 * The bubble on an editor that shares `markdown` with a co-editor over Yjs,
 * the selection set by `select`. Returns the co-editor.
 */
async function mountShared(markdown: string, select: (doc: Editor['state']['doc']) => Selection): Promise<Editor> {
  const ours = new Y.Doc()
  const theirs = new Y.Doc()
  ours.on('update', (update: Uint8Array, origin: unknown) => origin !== theirs && Y.applyUpdate(theirs, update, ours))
  theirs.on('update', (update: Uint8Array, origin: unknown) => origin !== ours && Y.applyUpdate(ours, update, theirs))
  const extensions = (document: Y.Doc) => [...buildCommitSchemaExtensions(), LinkTargetKeys, Collaboration.configure({ document })]
  peer = new Editor({ extensions: extensions(theirs) })
  peer.commands.setContent(parseMarkdownToJson(markdown))
  editor = new Editor({ extensions: extensions(ours) })
  editor.view.dispatch(editor.state.tr.setSelection(select(editor.state.doc)))
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(LinkTargetBubble as never, { editor, resolve: async () => null }) })
  app.component('UButton', { props: ['to', 'icon'], setup: (props, { attrs }) => () => h(props.to ? 'a' : 'button', { ...attrs, href: props.to }) })
  app.component('UInput', { setup: () => () => h('input') })
  app.mount(root)
  await nextTick()
  return peer
}

/** The position of the first node or text with `type` (a node or mark name). */
function find(doc: Editor['state']['doc'], type: string): number {
  let at = -1
  doc.descendants((node, pos) => {
    if (at < 0 && (node.type.name === type || node.marks.some(mark => mark.type.name === type))) at = pos
  })
  return at
}

const text = (testid: string) => root.querySelector(`[data-testid="${testid}"]`)?.textContent ?? null

afterEach(() => {
  app?.unmount()
  app = undefined
  peer?.destroy()
  peer = undefined
  editor?.destroy()
  root?.remove()
})

describe('LinkTargetBubble', () => {
  it('unmounts after its editor is destroyed without an error, and drops its key listener', async () => {
    await mount('See [the guide](https://example.org/guide) here.', 'link', null)
    const remove = vi.spyOn(editor.view.dom, 'removeEventListener')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    editor.destroy()
    app?.unmount()
    app = undefined
    expect(error).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    error.mockRestore()
  })

  it('names a page link’s target by title and path, with the block’s opening words', async () => {
    await mount('See :doc[Rollback]{nid="42" block="b-1"} here.', 'docLink', {
      title: 'Release process',
      path: '/handbook/release',
      blockLabel: 'Roll back by redeploying the previous tag',
      versions: { 'b-1': 'aaaaaaaaaaaa' },
    })
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Page link')
    expect(text('link-target')).toBe('Release process')
    expect(text('link-target-detail')).toBe('/handbook/release')
    expect(root.textContent).toContain('Roll back by redeploying the previous tag')
    expect(root.querySelector('[aria-label="Open in a new tab"]')?.getAttribute('href')).toBe('/handbook/release#b-1')
  })

  it('says when the target does not resolve, and still offers Open, Change and Remove', async () => {
    await mount('See :doc[Gone]{nid="99"} here.', 'docLink', null)
    expect(text('link-target')).toBe('Page not found or not accessible')
    expect(text('link-target-detail')).toBe('/node/99')
    for (const label of ['Open in a new tab', 'Change page link', 'Remove page link']) {
      expect(root.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    }
  })

  it('notes a citation whose source changed since it was cited', async () => {
    await mount('Derived. :citation{nid="42" block="b-1" v="aaaaaaaaaaaa"}', 'citation', {
      title: 'Release process',
      path: '/handbook/release',
      blockLabel: 'Roll back',
      versions: { 'b-1': 'bbbbbbbbbbbb' },
    })
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Citation')
    expect(text('link-target-note')).toBe('the source has changed since it was cited')
  })

  it('says a page link without a page is not found, and offers no Open', async () => {
    await mount('See :doc[Nowhere]{nid="99"} here.', 'docLink', null)
    editor.view.dispatch(editor.state.tr.setNodeAttribute(editor.state.selection.from, 'nid', null))
    await nextTick()
    expect(text('link-target')).toBe('Page not found or not accessible')
    expect(root.querySelector('[data-testid="link-target"]')?.tagName).toBe('SPAN')
    expect(root.querySelector('[aria-label="Open in a new tab"]')?.getAttribute('href')).toBeNull()
  })

  describe('with a co-editor', () => {
    const field = () => root.querySelector('input')
    async function open(): Promise<void> {
      requestLinkBubble(editor, 'url')
      await vi.waitFor(() => expect(field()).not.toBeNull())
    }

    it('keeps a link’s URL field open while they type above, below and in another paragraph', async () => {
      const them = await mountShared('Intro.\n\nSee [the guide](https://example.org/guide) here.\n\nOutro.', doc => TextSelection.create(doc, find(doc, 'link') + 2))
      await open()
      them.commands.insertContentAt(1, 'More ')
      them.commands.insertContentAt(them.state.doc.content.size - 2, ' more')
      them.chain().setTextSelection(3).splitBlock().run()
      await nextTick()
      expect(editor.state.doc.textContent).toContain('More Intro')
      expect(field()).not.toBeNull()
    })

    it('keeps the field for new link words open while they type above', async () => {
      const them = await mountShared('Intro.\n\nSee the guide here.', (doc) => {
        const at = find(doc, 'text') + 'Intro.'.length + 6
        return TextSelection.create(doc, at, at + 'the guide'.length)
      })
      await open()
      them.commands.insertContentAt(1, 'More ')
      await nextTick()
      expect(field()).not.toBeNull()
    })

    it('keeps a URL citation’s field open while they type above', async () => {
      const them = await mountShared('Intro.\n\nDerived. :citation{url="https://example.org/a"}', doc => NodeSelection.create(doc, find(doc, 'citation')))
      root.querySelector<HTMLElement>('[aria-label="Change citation"]')?.click()
      await vi.waitFor(() => expect(field()).not.toBeNull())
      them.commands.insertContentAt(1, 'More ')
      await nextTick()
      expect(field()).not.toBeNull()
    })

    it('closes the field when they delete the link', async () => {
      const them = await mountShared('Intro.\n\nSee [the guide](https://example.org/guide) here.', doc => TextSelection.create(doc, find(doc, 'link') + 2))
      await open()
      const at = find(them.state.doc, 'link')
      them.commands.deleteRange({ from: at, to: at + 'the guide'.length })
      await nextTick()
      expect(field()).toBeNull()
    })
  })
})
