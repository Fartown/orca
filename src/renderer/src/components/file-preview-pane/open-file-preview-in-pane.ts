import { toast } from 'sonner'
import {
  canPreviewLanguage,
  getWorkspaceFilePreviewPlan,
  openDocPreviewTab
} from '@/lib/file-preview'
import { useAppStore } from '@/store'

/**
 * Open a rendered preview as a tab in the pane the request came from, and switch to it.
 *
 * Why not the upstream right split: a preview is a second way to read one file, not a second file
 * to read beside it. Splitting halves the pane on every click and leaves the reader to close the
 * split to get back, while a tab in the same pane switches back like every other tab.
 */
export function openFilePreviewInSourcePane(params: {
  language: string
  filePath: string
  worktreeId: string
  sourceGroupId: string | null
}): void {
  if (!canPreviewLanguage(params.language)) {
    return
  }
  const state = useAppStore.getState()
  const plan = getWorkspaceFilePreviewPlan(state, params.worktreeId, params.filePath)
  if (plan.status === 'unsupported') {
    toast.error(plan.message)
    return
  }
  // Why the fallbacks: under a split layout the caller's own group is the preview's home, but a
  // caller that cannot name one still belongs in the pane the reader is looking at.
  const targetGroupId =
    params.sourceGroupId ??
    state.activeGroupIdByWorktree[params.worktreeId] ??
    state.groupsByWorktree[params.worktreeId]?.[0]?.id ??
    undefined
  if (plan.status === 'doc-preview') {
    openDocPreviewTab(state, {
      filePath: params.filePath,
      worktreeId: params.worktreeId,
      targetGroupId,
      activate: true
    })
    return
  }
  state.createBrowserTab(params.worktreeId, plan.url, {
    title: plan.title,
    targetGroupId,
    activate: true
  })
}
