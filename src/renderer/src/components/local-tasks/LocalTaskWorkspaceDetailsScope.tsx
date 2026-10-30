import { useState } from 'react'
import { useAppStore } from '@/store'
import { useWorktreeMetaWorkspace } from '@/components/sidebar/use-worktree-meta-workspace'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { LocalTaskSourceTabContext } from '@/local-tasks/local-task-source-tab'
import { LOCAL_TASK_DETAILS_TAB_KEY } from '@/local-tasks/local-task-workspace-details'
import { useLocalTaskLinkDraft } from '@/local-tasks/use-local-task-link-draft'

/**
 * Holds the workspace's task draft around Orca's workspace details (REQ-011), resolving the
 * workspace from the same modal data the dialog reads; the dialog's Save writes the draft.
 */
export function LocalTaskWorkspaceDetailsScope({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const open = useAppStore((state) => state.activeModal === 'edit-meta')
  const modalData = useAppStore((state) => state.modalData)
  const worktreeId = open && typeof modalData.worktreeId === 'string' ? modalData.worktreeId : ''
  const ownerRepoId = typeof modalData.repoId === 'string' ? modalData.repoId : null
  const executionHostId =
    typeof modalData.executionHostId === 'string'
      ? (parseExecutionHostId(modalData.executionHostId)?.id ?? undefined)
      : undefined
  const { worktree } = useWorktreeMetaWorkspace({ worktreeId, ownerRepoId, executionHostId })
  // Why once: the dialog remounts per workspace, and the tab it opens on is chosen at opening.
  const [initialMode] = useState(() => open && modalData[LOCAL_TASK_DETAILS_TAB_KEY] === true)
  const tab = useLocalTaskLinkDraft({ worktree, executionHostId, initialMode })
  return (
    <LocalTaskSourceTabContext.Provider value={tab}>{children}</LocalTaskSourceTabContext.Provider>
  )
}
