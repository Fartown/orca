import { stripInlineMarkdownForToc } from '@/components/editor/markdown-table-of-contents'

/** Readable one-line text for list and card excerpts; the stored writeback stays Markdown. */
export function localTaskProgressSummary(markdown: string): string {
  return stripInlineMarkdownForToc(
    markdown
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+/gm, '')
      .replace(/^[ \t]{0,3}(?:```|~~~).*$/gm, '')
  )
}
