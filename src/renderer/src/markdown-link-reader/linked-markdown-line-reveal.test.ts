import { beforeEach, describe, expect, it, vi } from 'vitest'

const scheduleEditorLineReveal = vi.fn()
const setMarkdownViewMode = vi.fn()
type LinkStoreState = {
  unifiedTabsByWorktree: Record<string, unknown[]>
  markdownViewMode: Record<string, string>
  settings: { markdownDefaultViewMode?: 'source' | 'rich' }
}
const state: LinkStoreState & Record<string, unknown> = {
  unifiedTabsByWorktree: {},
  markdownViewMode: {},
  settings: {},
  setMarkdownViewMode,
  openFileForLink: vi.fn(
    (_file: unknown, _options: unknown, _intent: unknown, reveal: (shown: unknown) => void) => {
      const shown = { fileId: 'wt::/repo/docs/guide.md', viewStateId: 'view-1', groupId: 'g1' }
      reveal(shown)
      return shown
    }
  )
}

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/store/slices/editor/focus/editor-focus-reveal', () => ({
  scheduleEditorLineReveal: (...args: unknown[]) => scheduleEditorLineReveal(...args)
}))
vi.mock('@/components/tab-group/editor-reveal/editor-reveal-flash', () => ({
  flashRevealedEditorView: vi.fn()
}))

const { openLinkedFileInEditor } =
  await import('@/components/terminal-pane/links/files/terminal-file-link-editor-open')

function clickLineLink(filePath: string): void {
  openLinkedFileInEditor(
    { filePath, relativePath: 'docs/guide.md', worktreeId: 'wt' },
    null,
    { line: 12, column: null },
    () => true
  )
}

describe('line-numbered links to Markdown files', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.markdownViewMode = {}
    state.settings = {}
  })

  it('keep a newly opened Markdown tab in the reader and skip the line jump', () => {
    clickLineLink('/repo/docs/guide.md')

    expect(setMarkdownViewMode).not.toHaveBeenCalled()
    expect(scheduleEditorLineReveal).not.toHaveBeenCalled()
  })

  it('keep a tab the user switched to the reader there even when the default is source', () => {
    state.settings = { markdownDefaultViewMode: 'source' }
    state.markdownViewMode = { 'wt::/repo/docs/guide.md': 'rich' }

    clickLineLink('/repo/docs/guide.md')

    expect(scheduleEditorLineReveal).not.toHaveBeenCalled()
  })

  it('jump to the line when the Markdown tab is already in source', () => {
    state.markdownViewMode = { 'wt::/repo/docs/guide.md': 'source' }

    clickLineLink('/repo/docs/guide.md')

    expect(setMarkdownViewMode).not.toHaveBeenCalled()
    expect(scheduleEditorLineReveal).toHaveBeenCalledWith(
      expect.any(Function),
      '/repo/docs/guide.md',
      12,
      1,
      'wt::/repo/docs/guide.md',
      expect.objectContaining({ viewStateId: 'view-1' })
    )
  })

  it('jump to the line when the user opens Markdown in source by default', () => {
    state.settings = { markdownDefaultViewMode: 'source' }

    clickLineLink('/repo/docs/guide.md')

    expect(scheduleEditorLineReveal).toHaveBeenCalledTimes(1)
  })
})
