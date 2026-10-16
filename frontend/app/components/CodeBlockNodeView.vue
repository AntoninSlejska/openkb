<script setup lang="ts">
/**
 * The editor's code block: the read view's tools row with a language picker
 * in place of the label, over the editable code. The colours are the
 * decorations of `app/editor/code-highlight.ts`.
 */
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'
import { CODE_LANGUAGES, codeLanguage } from '#shared/utils/code-languages'

const props = defineProps<NodeViewProps>()

/** Reka's select takes no empty value, so "no language" has a name of its own. */
const PLAIN = 'plain'

const stored = computed(() => String(props.node.attrs.language ?? ''))

/** A known language by its id, whatever alias the fence spells it with. */
const value = computed(() => (stored.value === '' ? PLAIN : codeLanguage(stored.value)?.id ?? stored.value))

/** An info string outside the set stays selectable, so opening the picker does not lose it. */
const items = computed(() => [
  { label: 'Plain text', value: PLAIN },
  ...CODE_LANGUAGES.map(lang => ({ label: lang.label, value: lang.id })),
  ...(stored.value !== '' && !codeLanguage(stored.value) ? [{ label: stored.value, value: stored.value }] : []),
])

function choose(next: string): void {
  if (next === value.value) return
  props.updateAttributes({ language: next === PLAIN ? null : next })
}
</script>

<template>
  <NodeViewWrapper
    as="pre"
    class="okb-code"
    :id="props.HTMLAttributes.id"
  >
    <span
      class="okb-code-tools"
      contenteditable="false"
    >
      <USelect
        :model-value="value"
        :items="items"
        value-key="value"
        size="xs"
        variant="ghost"
        aria-label="Code language"
        class="okb-code-lang"
        :ui="{ content: 'min-w-40' }"
        @update:model-value="choose"
      />
    </span>
    <NodeViewContent
      as="code"
      :class="value === PLAIN ? undefined : `language-${value}`"
    />
  </NodeViewWrapper>
</template>
