import type { MarkdownViewMode } from '@/store/slices/editor'

export type MarkdownRenderMode = 'source' | 'rich-editor' | 'preview'

export type MarkdownRenderState = {
  renderMode: MarkdownRenderMode
  richModeUnsupportedMessage: string | null
  // Why: rich mode owns a document it cannot round-trip, so the surface keeps
  // the rewrite risk visible instead of only warning at the moment of opt-in.
  richModeUnsupportedOverrideActive: boolean
}

export function getMarkdownRenderMode({
  exceedsRichModeSizeLimit,
  hasRichModeUnsupportedContent,
  viewMode
}: {
  exceedsRichModeSizeLimit: boolean
  hasRichModeUnsupportedContent: boolean
  viewMode: MarkdownViewMode
}): MarkdownRenderMode {
  if (viewMode === 'source') {
    return 'source'
  }

  // Explicit preview stays rendered even when rich editing is unsafe.
  if (viewMode === 'preview') {
    return 'preview'
  }

  // Keep large documents editable in Monaco without ProseMirror’s full-document rendering and serialization cost.
  if (exceedsRichModeSizeLimit) {
    return 'source'
  }

  // Preview preserves unsupported syntax; Source remains available for editing.
  return hasRichModeUnsupportedContent ? 'preview' : 'rich-editor'
}
