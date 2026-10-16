import { describe, it, expect } from 'vitest'
import { appShortcutBindings } from '../composables/useAppShortcuts'
import { appShortcuts, shortcutKeys } from './help-shortcuts'

describe('the help page’s app shortcuts', () => {
  it('lists exactly the shortcuts useAppShortcuts binds', () => {
    const bound = appShortcutBindings({ openSearch: () => {}, toggleChat: () => {} })
    expect(appShortcuts.map(row => row.id)).toEqual(Object.keys(bound))
  })

  it('says what each one does', () => {
    for (const row of appShortcuts) {
      expect(row.what.length, row.id).toBeGreaterThan(0)
    }
  })
})

describe('shortcutKeys', () => {
  it('renders the modifier by name and the letter as a key cap', () => {
    expect(shortcutKeys('meta_k')).toEqual(['meta', 'K'])
    expect(shortcutKeys('meta_shift_z')).toEqual(['meta', 'shift', 'Z'])
  })
})
