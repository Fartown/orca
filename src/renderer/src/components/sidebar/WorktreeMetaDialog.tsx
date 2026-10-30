import React from 'react'
import { useAppStore } from '@/store'
import WorktreeMetaDialogDraft from './WorktreeMetaDialogDraft'
import { getWorktreeMetaDialogOwner } from './worktree-meta-dialog-owner'
import { LocalTaskWorkspaceDetailsScope } from '@/components/local-tasks/LocalTaskWorkspaceDetailsScope'

export default function WorktreeMetaDialog(): React.JSX.Element {
  const owner = useAppStore(getWorktreeMetaDialogOwner)
  return (
    <LocalTaskWorkspaceDetailsScope key={owner ?? 'closed'}>
      <WorktreeMetaDialogDraft />
    </LocalTaskWorkspaceDetailsScope>
  )
}
