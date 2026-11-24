// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import type { MarkdownRenderState } from '@/components/editor/markdown/render-mode/markdown-render-mode'

vi.mock('@/store/index', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setMarkdownRichModeSizeOverride: vi.fn() })
}))

vi.mock('@/i18n/use-translate', () => ({
  useTranslate: () => (_key: string, fallback: string) => fallback
}))

// Why: the surface passes its banners through headerSlot, so the stub has to render it.
vi.mock('@/components/editor/editor-lazy-views', () => ({
  RichMarkdownEditor: ({ headerSlot }: { headerSlot?: React.ReactNode }) => (
    <div data-editor-view="rich-editor">{headerSlot}</div>
  ),
  MarkdownPreview: () => <div data-editor-view="preview" />
}))

vi.mock('@/components/editor/rich-markdown/instance/RichMarkdownErrorBoundary', () => ({
  RichMarkdownErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

import { EditorMarkdownFileSurface } from '@/components/editor/panel/EditorMarkdownFileSurface'

afterEach(cleanup)

const README: OpenFile = {
  id: '/repo/README.md',
  filePath: '/repo/README.md',
  relativePath: 'README.md',
  worktreeId: 'wt-1',
  language: 'markdown',
  mode: 'edit',
  isDirty: false
}

function renderSurface(state: MarkdownRenderState, content = '[reference]: https://example.com') {
  return render(
    <EditorMarkdownFileSurface
      activeFile={README}
      viewStateScopeId="view-1"
      editorViewStateKey="key-1"
      currentContent={content}
      mdViewMode="rich"
      inlineMarkdownRenderState={state}
      showMarkdownTableOfContents={false}
      showMarkdownFrontmatter={false}
      onCloseMarkdownTableOfContents={vi.fn()}
      markdownAnnotationsEnabled={false}
      markdownDocuments={{ previewProps: {} } as never}
      getMarkdownSourceLineOffset={() => 0}
      handleContentChange={vi.fn()}
      handleDirtyStateHint={vi.fn()}
      monacoEditor={<div data-editor-view="source" />}
    />
  )
}

describe('rich Markdown unsupported override surface', () => {
  it('offers Open anyway on the unsupported-syntax preview fallback', () => {
    const view = renderSurface({
      renderMode: 'preview',
      richModeUnsupportedMessage: 'Reference links require source mode.',
      richModeUnsupportedOverrideActive: false
    })

    expect(view.container.querySelector('[data-editor-view="preview"]')).toBeTruthy()
    expect(view.getByText('Reference links require source mode.')).toBeTruthy()
    expect(view.getByText('Open anyway')).toBeTruthy()
  })

  it('warns for as long as rich mode holds a document it cannot round-trip', () => {
    const view = renderSurface({
      renderMode: 'rich-editor',
      richModeUnsupportedMessage: null,
      richModeUnsupportedOverrideActive: true
    })

    expect(view.container.querySelector('[data-editor-view="rich-editor"]')).toBeTruthy()
    expect(view.getByText(/Saving from here can rewrite or drop/)).toBeTruthy()
  })

  it('shows no rewrite warning when only the size gate was lifted', () => {
    const view = renderSurface({
      renderMode: 'rich-editor',
      richModeUnsupportedMessage: null,
      richModeUnsupportedOverrideActive: false
    })

    expect(view.queryByText(/Saving from here can rewrite or drop/)).toBeNull()
  })
})
