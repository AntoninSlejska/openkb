import { describe, it, expect } from 'vitest'
import { classifyDeadlock } from '../../tests/playwright/helpers/deadlock'

/**
 * OKB-284 — which drush seed is sent through a deadlock again.
 *
 * A seed that loses the known `cache_entity` race is retried; every other
 * deadlock fails on the first attempt (tests/playwright/helpers/lock-race.ts).
 * The classifier decides that, so it is read here against real output: every
 * sample below is a verbatim capture of a deadlock forced against this project's own MariaDB
 * through `drush php:eval`, whose error block wraps at a fixed width and splits
 * tokens mid-word.
 */

/** A `cache_entity` INSERT. Wrapped through `"d ata"` and the placeholders. */
const INSERT = `In ExceptionHandler.php line 96:

  SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to
  get lock; try restarting transaction: INSERT INTO "cache_entity" ("cid", "d
  ata", "created", "expire", "tags", "checksum", "serialized") VALUES (:db_in
  sert_placeholder_0, :db_insert_placeholder_1, :db_insert_placeholder_2, :db
  _insert_placeholder_3, :db_insert_placeholder_4, :db_insert_placeholder_5,
  :db_insert_placeholder_6); Array
  (
      [:db_insert_placeholder_0] => okb247-values:content_moderation_state:re
  vision:371
  )
`

/** The same race on a DELETE. */
const DELETE = `In ExceptionHandler.php line 96:

  SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to
  get lock; try restarting transaction: DELETE FROM "cache_entity"
  WHERE "cid" = :db_condition_placeholder_0; Array
  (
      [:db_condition_placeholder_0] => okb247-a
  )
`

/** A lock race somewhere else. Nothing here is known, so nothing is retried. */
const OTHER_TABLE = `In ExceptionHandler.php line 96:

  SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to
  get lock; try restarting transaction: UPDATE "node_field_data" SET "changed
  "=:db_update_placeholder_0
  WHERE "nid" = :db_condition_placeholder_0; Array
  (
      [:db_update_placeholder_0] => 1789646464
      [:db_condition_placeholder_0] => 1
  )
`

/**
 * A victim the table cannot be read from, whose parameters name `cache_entity`
 * anyway — the row this was forced on is keyed by that text on purpose. The
 * statement is the one behind the message, not the first one the text mentions.
 */
const READ_LOCK = `In ExceptionHandler.php line 96:

  SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to
  get lock; try restarting transaction: SELECT "k".*
  FROM
  "key_value" "k"
  WHERE ("collection" = :db_condition_placeholder_0) AND ("name" = :db_condit
  ion_placeholder_1) FOR UPDATE; Array
  (
      [:db_condition_placeholder_0] => okb247
      [:db_condition_placeholder_1] => DELETE FROM "cache_entity"
  )
`

describe('the deadlock classifier', () => {
  it('retries a cache_entity INSERT, and reads it across a line wrap', async () => {
    expect(classifyDeadlock(INSERT)).toEqual({ table: 'cache_entity', stmt: 'INSERT', known: true })
  })

  it('retries a cache_entity DELETE', async () => {
    expect(classifyDeadlock(DELETE)).toEqual({ table: 'cache_entity', stmt: 'DELETE', known: true })
  })

  it('names a lock race on another table, and does not retry it', async () => {
    expect(classifyDeadlock(OTHER_TABLE)).toEqual({ table: 'node_field_data', stmt: 'UPDATE', known: false })
  })

  it('does not read a table out of the statement’s parameters', async () => {
    expect(classifyDeadlock(READ_LOCK)).toEqual({ table: 'unknown', stmt: 'unknown', known: false })
  })

  it('says a failure that is no deadlock is none', async () => {
    expect(classifyDeadlock('Seeding kb_page \'x\' failed: SQLSTATE[23000]: Integrity constraint violation')).toBeNull()
  })
})
