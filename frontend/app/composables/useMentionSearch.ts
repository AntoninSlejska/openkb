interface UserHit { uid: number, name: string }
interface MentionItem { label: string, id: number }

/**
 * The @-mention picker's user search: debounced, the previous request aborted.
 * The pending timer and request end with the calling scope.
 */
export function useMentionSearch() {
  const mentionQuery = ref('')
  const mentionItems = ref<MentionItem[]>([])
  let mentionAbort: AbortController | null = null
  let mentionTimer: ReturnType<typeof setTimeout> | null = null

  watch(mentionQuery, (q) => {
    if (mentionTimer) clearTimeout(mentionTimer)
    mentionTimer = setTimeout(async () => {
      if (mentionAbort) mentionAbort.abort()
      mentionAbort = new AbortController()
      if (!q) { mentionItems.value = []; return }
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          signal: mentionAbort.signal,
          credentials: 'same-origin',
        })
        if (!res.ok) { mentionItems.value = []; return }
        const data = await res.json() as { users: UserHit[] }
        mentionItems.value = (data.users ?? []).map(u => ({ label: u.name, id: u.uid }))
      }
      catch { /* aborted or network */ }
    }, 120)
  })

  onScopeDispose(() => {
    if (mentionTimer) clearTimeout(mentionTimer)
    mentionAbort?.abort()
  })

  return { mentionQuery, mentionItems }
}
