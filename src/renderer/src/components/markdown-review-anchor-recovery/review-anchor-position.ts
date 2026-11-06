import type { Editor } from '@tiptap/react'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { translate } from '@/i18n/i18n'
import { getRichMarkdownAnnotationHighlightRangesForComment } from '../editor/rich-markdown-review-annotations'
import type { RichMarkdownCommentBlock } from '../editor/rich-markdown-comment-blocks'
import { getRichMarkdownRangeStart } from '../editor/rich-markdown-range-bounds'
import type { RichMarkdownReviewNotePosition } from '../editor/rich-markdown-review-note-layout'

export function resolveMarkdownReviewAnchorPosition({
  editor,
  comment,
  blocks,
  containerRect,
  scrollTop,
  markdownSourceLineOffset
}: {
  editor: Editor
  comment: DiffComment
  blocks: readonly RichMarkdownCommentBlock[]
  containerRect: DOMRect
  scrollTop: number
  markdownSourceLineOffset: number
}): RichMarkdownReviewNotePosition {
  const line = Math.max(1, comment.lineNumber - markdownSourceLineOffset)
  const block = blocks.find((candidate) => candidate.startLine <= line && line <= candidate.endLine)
  const hasQuote = Boolean(comment.selectedText?.trim())
  const ranges = hasQuote
    ? getRichMarkdownAnnotationHighlightRangesForComment(
        editor,
        comment,
        markdownSourceLineOffset,
        blocks
      )
    : []
  const anchor = getRichMarkdownRangeStart(ranges) ?? (hasQuote ? undefined : block?.from)
  if (anchor !== undefined) {
    try {
      const coordinates = editor.view.coordsAtPos(
        Math.max(1, Math.min(anchor, editor.state.doc.content.size))
      )
      return { comment, top: coordinates.top - containerRect.top + scrollTop }
    } catch {
      // Keep the note accessible while its source geometry is unavailable.
    }
  }
  return { comment, top: 0, anchorUnresolved: true }
}

export function getMarkdownReviewAnchorLabel(unresolved: boolean | undefined): string | null {
  return unresolved
    ? translate('markdownReviewAnchorRecovery.originalTextChanged', 'Original text changed')
    : null
}
