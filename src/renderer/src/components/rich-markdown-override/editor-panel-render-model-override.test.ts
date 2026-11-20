import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { RICH_MARKDOWN_MAX_SIZE_BYTES } from '../../../../shared/editor/markdown/rich-markdown-size-limit'
import { getEditorPanelRenderModel } from '@/components/editor/panel/editor-panel-render-model'

const README: OpenFile = {
  id: '/repo/README.md',
  filePath: '/repo/README.md',
  relativePath: 'README.md',
  worktreeId: 'wt-1',
  language: 'markdown',
  mode: 'edit',
  isDirty: false
}

function richModel(content: string, overridden: boolean) {
  return getEditorPanelRenderModel({
    activeFile: README,
    fileContents: { [README.id]: { content: '# Hello', isBinary: false } },
    editorDrafts: { [README.id]: content },
    gitStatusEntries: undefined,
    gitBranchEntries: undefined,
    markdownViewMode: { [README.id]: 'rich' },
    markdownRichModeSizeOverridden: overridden,
    isChangesMode: false,
    canOpenWorkspaceFileBrowser: true
  }).inlineMarkdownRenderState
}

describe('getEditorPanelRenderModel rich-mode unsupported override', () => {
  // Editable details still needs a DOM round trip above the probe budget.
  const unverifiedHtml = `${'a'.repeat(50_001)}\n\n<details>\n<summary>Toggle</summary>\n\nBody\n\n</details>\n`

  it('falls back to preview with an explanation until the user overrides', () => {
    const state = richModel(unverifiedHtml, false)

    expect(state?.renderMode).toBe('preview')
    expect(state?.richModeUnsupportedMessage).toEqual(expect.any(String))
    expect(state?.richModeUnsupportedOverrideActive).toBe(false)
  })

  it('hands the document to the rich editor once the user overrides', () => {
    const state = richModel(unverifiedHtml, true)

    expect(state?.renderMode).toBe('rich-editor')
    expect(state?.richModeUnsupportedMessage).toBeNull()
    expect(state?.richModeUnsupportedOverrideActive).toBe(true)
  })

  it('does not flag an override on a clean document that only tripped the size gate', () => {
    const state = richModel('a'.repeat(RICH_MARKDOWN_MAX_SIZE_BYTES + 1), true)

    expect(state?.renderMode).toBe('rich-editor')
    expect(state?.richModeUnsupportedOverrideActive).toBe(false)
  })
})
