import { defineNitroPlugin } from 'nitropack/runtime'
import { warmCodeHighlighter } from '#shared/utils/code-highlight'

/**
 * Creates the highlighter at startup, with the languages most pages fence,
 * so the first read of a page with code does not wait for them. The rest
 * load on their first fence.
 */
export default defineNitroPlugin(() => {
  void warmCodeHighlighter(['bash', 'json', 'yaml', 'php', 'javascript', 'typescript'])
})
