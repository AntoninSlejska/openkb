import { describe, expect, it } from 'vitest'
import { readThreads, recordCommentMessage, type InlineCommentRecord } from '#shared/block-comments'
import * as Y from 'yjs'
import {
  commentRecords,
  commentsSynced,
  seedComments,
  stampCommentAuthors,
  META_NODE_UUID,
  type CommentWriter,
} from './collab-comments'
import { commentsRoot, type CommentMessage } from '#shared/block-comments'

/**
 * What a checkpoint states, and what a reconcile makes of Drupal's answer.
 *
 * The seam these pin is the whole durability story of an inline conversation.
 * A statement is the document's whole map, so the failure modes are not "owed
 * or delivered" any more — they are stating a map that was never filled, which
 * would delete what Drupal holds, and losing a foreign page's conversation
 * into this one.
 */

const AT = 1_754_000_000_000
const OWNER = '11111111-1111-4111-8111-111111111111'

function said(doc: Y.Doc, block: string, thread: string, msg: string, text: string, at = AT): void {
  recordCommentMessage(doc, block, thread, msg, { uid: 7, at, text })
}

function stored(block: string, thread: string, msg: string, text: string): InlineCommentRecord {
  return {
    anchor: block,
    thread_id: thread,
    msg_id: msg,
    uid: 7,
    data: { uid: 7, at: AT, name: 'fago', text },
  }
}

describe('commentRecords', () => {
  it('states the whole map, oldest first', () => {
    const doc = new Y.Doc()
    said(doc, 'b-1', 'c-1', 'm-2', 'second', AT + 1)
    said(doc, 'b-1', 'c-1', 'm-1', 'first', AT)

    expect(commentRecords(doc).map(record => record.msg_id)).toEqual(['m-1', 'm-2'])
  })

  it('lifts the coordinates out and carries the message as it stands', () => {
    const doc = new Y.Doc()
    const message = {
      uid: 7,
      name: 'fago',
      at: AT,
      text: 'is this still true?',
      anchor: { from: 0, to: 3, quote: 'One' },
    }
    recordCommentMessage(doc, 'b-1', 'c-1', 'm-1', message)

    expect(commentRecords(doc)[0]).toEqual({
      anchor: 'b-1',
      thread_id: 'c-1',
      msg_id: 'm-1',
      uid: 7,
      data: message,
    })
  })

  it('leaves a message naming nobody out of the statement', () => {
    const doc = new Y.Doc()
    recordCommentMessage(doc, 'b-1', 'c-1', 'm-1', { uid: null, at: AT, text: 'from nowhere' })

    expect(commentRecords(doc)).toEqual([])
  })
})

describe('seedComments', () => {
  it('adds what Drupal holds and the document lost', () => {
    const doc = new Y.Doc()

    seedComments(doc, OWNER, [stored('b-1', 'c-1', 'm-1', 'said in an earlier session')])

    const threads = readThreads(doc)
    expect(threads).toHaveLength(1)
    expect(threads[0]!.messages[0]!.text).toBe('said in an earlier session')
  })

  it('keeps a message Drupal does not hold, so the next statement carries it', () => {
    const doc = new Y.Doc()
    seedComments(doc, OWNER, [])
    said(doc, 'b-1', 'c-1', 'm-1', 'landed')
    said(doc, 'b-1', 'c-1', 'm-2', 'never landed', AT + 1)

    // Drupal only ever heard about the first one — the second's statement was
    // lost, whatever this session believed.
    seedComments(doc, OWNER, [stored('b-1', 'c-1', 'm-1', 'landed')])

    expect(commentRecords(doc).map(record => record.msg_id)).toEqual(['m-1', 'm-2'])
  })

  it('is what makes the document statable at all', () => {
    const doc = new Y.Doc()
    expect(commentsSynced(doc)).toBe(false)

    seedComments(doc, OWNER, [])

    expect(commentsSynced(doc)).toBe(true)
  })

  it('empties a document whose node id now belongs to another page', () => {
    const doc = new Y.Doc()
    said(doc, 'b-1', 'c-1', 'm-1', 'about the page that is gone')

    expect(seedComments(doc, OWNER, [])).toBe('dropped')

    expect(readThreads(doc)).toEqual([])
    expect(doc.getMap('_meta').get(META_NODE_UUID)).toBe(OWNER)
  })

  it('drops a foreign conversation even where the coordinates collide', () => {
    const doc = new Y.Doc()
    said(doc, 'b-1', 'c-1', 'm-1', 'the other page said this')

    seedComments(doc, OWNER, [stored('b-1', 'c-1', 'm-1', 'this page says this')])

    expect(readThreads(doc)[0]!.messages[0]!.text).toBe('this page says this')
  })

  it('leaves a document that already belongs here alone', () => {
    const doc = new Y.Doc()
    seedComments(doc, OWNER, [])
    said(doc, 'b-1', 'c-1', 'm-1', 'said in this session')

    expect(seedComments(doc, OWNER, [])).toBe('seeded')
    expect(commentRecords(doc).map(record => record.msg_id)).toEqual(['m-1'])
  })
})

describe('stampCommentAuthors', () => {
  const PEER = { source: 'connection' }
  const EDITOR2: CommentWriter = { uid: 9, name: 'editor2', via: null }

  /** A document whose comment writes from {@link PEER} are filed under `writer`. */
  function stamping(writer: CommentWriter | null): Y.Doc {
    const doc = new Y.Doc()
    commentsRoot(doc).observe((event, transaction) => {
      if (transaction.origin === PEER) stampCommentAuthors(event, writer)
    })
    return doc
  }

  function write(doc: Y.Doc, msg: string, message: CommentMessage, origin: unknown = PEER): void {
    doc.transact(() => { commentsRoot(doc).set(`b-1\u0000c-1:${msg}`, message) }, origin)
  }

  function messages(doc: Y.Doc) {
    return commentRecords(doc).map(record => ({ msg: record.msg_id, ...record.data }))
  }

  it('drops a message a peer files under another account', () => {
    const doc = stamping(EDITOR2)
    write(doc, 'm-1', { uid: 7, name: 'editor1', at: AT, text: 'as editor1' })
    expect(messages(doc)).toEqual([])
    expect(commentsRoot(doc).size).toBe(0)
  })

  it('files a peer\'s own message under its server-known name, without a via', () => {
    const doc = stamping(EDITOR2)
    write(doc, 'm-1', { uid: 9, name: 'admin', via: 'Claude', at: AT, text: 'mine' })
    write(doc, 'm-2', { uid: null, at: AT + 1, text: 'before /api/me answered' })
    expect(messages(doc)).toEqual([
      { msg: 'm-1', uid: 9, name: 'editor2', at: AT, text: 'mine' },
      { msg: 'm-2', uid: 9, name: 'editor2', at: AT + 1, text: 'before /api/me answered' },
    ])
  })

  it('keeps an agent\'s via', () => {
    const doc = stamping({ uid: 9, name: 'editor2', via: 'Claude' })
    write(doc, 'm-1', { uid: 9, name: 'editor2', at: AT, text: 'from the agent' })
    expect(messages(doc)).toEqual([
      { msg: 'm-1', uid: 9, name: 'editor2', via: 'Claude', at: AT, text: 'from the agent' },
    ])
  })

  it('drops a write with no writer behind it', () => {
    const doc = stamping(null)
    write(doc, 'm-1', { uid: 9, name: 'editor2', at: AT, text: 'nobody' })
    expect(commentsRoot(doc).size).toBe(0)
  })

  it('puts back another account\'s message a peer deletes or overwrites', () => {
    const doc = stamping(EDITOR2)
    seedComments(doc, OWNER, [stored('b-1', 'c-1', 'm-1', 'said by fago')])
    const original = { msg: 'm-1', uid: 7, at: AT, name: 'fago', text: 'said by fago' }

    doc.transact(() => { commentsRoot(doc).delete('b-1\u0000c-1:m-1') }, PEER)
    expect(messages(doc)).toEqual([original])
    write(doc, 'm-1', { uid: 9, name: 'editor2', at: AT, text: 'now mine' })
    expect(messages(doc)).toEqual([original])
    write(doc, 'm-1', { uid: 3, name: 'editor3', at: AT, text: 'now editor3\'s' })
    expect(messages(doc)).toEqual([original])
  })

  it('lets a peer delete and rewrite its own message', () => {
    const doc = stamping(EDITOR2)
    write(doc, 'm-1', { uid: 9, at: AT, text: 'mine' })
    write(doc, 'm-1', { uid: 9, at: AT, text: 'still mine' })
    expect(messages(doc)).toEqual([{ msg: 'm-1', uid: 9, name: 'editor2', at: AT, text: 'still mine' }])
    doc.transact(() => { commentsRoot(doc).delete('b-1\u0000c-1:m-1') }, PEER)
    expect(commentsRoot(doc).size).toBe(0)
  })

  it('removes a value that is not a plain message', () => {
    const doc = stamping(EDITOR2)
    doc.transact(() => {
      const nested = new Y.Map<unknown>()
      commentsRoot(doc).set('b-1\u0000c-1:m-1', nested)
      nested.set('uid', 9)
      nested.set('at', AT)
      commentsRoot(doc).set('b-1\u0000c-1:m-2', { uid: 9, text: 'no timestamp' })
      commentsRoot(doc).set('b-1\u0000c-1:m-3', 'text')
    }, PEER)
    expect(commentsRoot(doc).size).toBe(0)
    expect(() => Y.encodeStateAsUpdate(doc)).not.toThrow()
  })

  it('removes a message carrying a value JSON cannot hold', () => {
    const doc = stamping(EDITOR2)
    doc.transact(() => {
      commentsRoot(doc).set('b-1\u0000c-1:m-1', { uid: 9, at: AT, text: 10n } as unknown as CommentMessage)
      commentsRoot(doc).set('b-1\u0000c-1:m-2', { uid: 9, at: AT, extra: { deep: [1n] } } as unknown as CommentMessage)
    }, PEER)
    expect(commentsRoot(doc).size).toBe(0)
    expect(() => JSON.stringify(commentRecords(doc))).not.toThrow()
  })

  it('puts back another account\'s message that has no timestamp', () => {
    const doc = stamping(EDITOR2)
    doc.transact(() => {
      commentsRoot(doc).set('b-1\u0000c-1:m-1', { uid: 7, name: 'fago', text: 'via the API' } as unknown as CommentMessage)
    })
    doc.transact(() => { commentsRoot(doc).delete('b-1\u0000c-1:m-1') }, PEER)
    expect(commentsRoot(doc).get('b-1\u0000c-1:m-1')).toEqual({ uid: 7, name: 'fago', text: 'via the API' })
  })

  it('leaves the server\'s own writes — a seed — as Drupal stated them', () => {
    const doc = stamping(EDITOR2)
    seedComments(doc, OWNER, [stored('b-1', 'c-1', 'm-1', 'said by fago')])
    expect(messages(doc)).toEqual([{ msg: 'm-1', uid: 7, at: AT, name: 'fago', text: 'said by fago' }])
  })
})
