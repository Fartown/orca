import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { EditorPanelHeader } from '@/components/editor/panel/header/EditorPanelHeader'

vi.mock('@/store/index', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeGroupIdByWorktree: {}, settings: {}, updateSettings: vi.fn() })
}))

vi.mock('@/components/diff-comments/use-visible-worktree-diff-comments', () => ({
  useVisibleWorktreeDiffComments: () => ({ owner: null, comments: [] })
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}))

vi.mock('@/components/editor/panel/header/EditorPanelHeaderPath', () => ({
  EditorPanelHeaderPath: () => null
}))

vi.mock('@/components/editor/panel/header/EditorPanelActionsMenu', () => ({
  EditorPanelActionsMenu: () => null
}))

vi.mock('@/components/editor/diff/review/DiffNotesSendMenu', () => ({
  DiffNotesSendMenu: () => null
}))

vi.mock('@/components/editor/diff/review/diff-navigation-context', () => ({
  useDiffNavigation: () => ({ changeCount: 0, goToPreviousDiff: vi.fn(), goToNextDiff: vi.fn() })
}))

vi.mock('@/components/artifacts/ArtifactPublishButton', () => ({
  ArtifactPublishButton: () => <button data-artifact-publish />
}))

vi.mock('@/components/self-hosted-artifacts/share-button/LanArtifactShareEntryButtons', () => ({
  EditorFileLanShareButton: () => <button data-lan-share />
}))

const activeFile: OpenFile = {
  id: '/repo/index.html',
  filePath: '/repo/index.html',
  relativePath: 'index.html',
  worktreeId: 'repo::/repo',
  language: 'html',
  isDirty: false,
  mode: 'edit'
}

const baseProps = {
  activeFile,
  copiedPathVisible: false,
  isSingleDiff: false,
  isDiffSurface: false,
  isMarkdown: false,
  isCsv: false,
  isNotebook: false,
  hasEditorToggle: false,
  availableEditorToggleModes: [],
  effectiveToggleValue: 'edit',
  canOpenPreview: false,
  canShowMarkdownPreview: false,
  canShowMarkdownTableOfContents: false,
  isMarkdownTableOfContentsDisabled: false,
  shouldShowMarkdownExportAction: false,
  canExportMarkdownToPdf: false,
  showMarkdownTableOfContents: false,
  canShowMarkdownFrontmatterToggle: false,
  markdownFrontmatterVisible: false,
  sideBySide: false,
  openFileState: { canOpen: false },
  onCopyPath: vi.fn(),
  onOpenDiffTargetFile: vi.fn(),
  onOpenPreview: vi.fn(),
  onOpenMarkdownPreview: vi.fn(),
  onToggleSideBySide: vi.fn(),
  onEditorToggleChange: vi.fn(),
  onToggleMarkdownTableOfContents: vi.fn(),
  onToggleMarkdownFrontmatter: vi.fn(),
  onExportMarkdownToPdf: vi.fn()
} satisfies ComponentProps<typeof EditorPanelHeader>

function renderHeader(overrides: Partial<ComponentProps<typeof EditorPanelHeader>> = {}): string {
  return renderToStaticMarkup(<EditorPanelHeader {...baseProps} {...overrides} />)
}

describe('EditorPanelHeader share entry', () => {
  it.each([false, true])(
    'shares a shareable document on the local network, never through the cloud (markdown: %s)',
    (isMarkdown) => {
      const html = renderHeader({ isMarkdown, createArtifactRequest: vi.fn() })
      expect(html).toContain('data-lan-share="true"')
      // This fork never registers the cloud artifact service, so its button can only fail.
      expect(html).not.toContain('data-artifact-publish')
    }
  )

  it('offers no share entry on diff surfaces or for unshareable documents', () => {
    expect(
      renderHeader({ isDiffSurface: true, isMarkdown: true, createArtifactRequest: vi.fn() })
    ).not.toContain('data-lan-share')
    expect(renderHeader({ isMarkdown: true })).not.toContain('data-lan-share')
  })
})
