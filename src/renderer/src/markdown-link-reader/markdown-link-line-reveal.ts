import { normalizeMarkdownDefaultViewMode } from '../../../shared/editor/markdown/markdown-default-view-mode'
import type { AppState } from '@/store/types'

/**
 * A line-numbered link to a Markdown file keeps the tab in the view it is showing; only a tab that
 * is already in source (stored, or by the user's default) jumps to the line (REQ-401, REQ-402).
 */
export function revealsLinkedMarkdownLine(
  state: Pick<AppState, 'markdownViewMode' | 'settings'>,
  fileId: string
): boolean {
  const view =
    state.markdownViewMode?.[fileId] ??
    normalizeMarkdownDefaultViewMode(state.settings?.markdownDefaultViewMode)
  return view === 'source'
}
