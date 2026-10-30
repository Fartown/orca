import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../shared/worktree/types'
import {
  findLocalTaskEffectiveWorkspace,
  findLocalTaskWorkspaceLink
} from './local-task-link-selectors'
import { openLocalTaskPage } from './local-task-navigation'
import type { LocalTaskPaletteItem } from './local-task-palette-items'
import { runLocalTaskStart, selectLocalTaskStartState } from './local-task-work-actions'
import { selectLocalTaskWorkspace } from './local-task-workspace-resolution'
import { localTasksDomainStore } from './local-tasks-domain-store'

type Input = {
  visible: boolean
  taskItems: readonly { id: string }[]
  handleSelectWorktree: (worktree: Worktree) => void
  closeModal: () => void
  recordFeatureInteraction: (feature: 'cmd-j') => void
  skipRestoreFocusRef: { current: boolean }
  setSelectedItemId: (id: string) => void
}

/** The workspace the task works in (its own, else the nearest ancestor's), when this window has it. */
function locateWorkspace(item: LocalTaskPaletteItem): Worktree | null {
  const domain = localTasksDomainStore.getState()
  const tasksById = new Map(domain.tasks.map((task) => [task.id, task]))
  const link = findLocalTaskEffectiveWorkspace(domain.links, item.task, tasksById)
  const located = link ? selectLocalTaskWorkspace(useAppStore.getState(), link) : null
  return located && typeof located !== 'string' ? located : null
}

/**
 * Enter goes to the workspace the task works in, else opens the task; Cmd/Ctrl+Enter starts work on
 * it, as upstream's task results do (REQ-007). A task whose own workspace is live has nothing to
 * start, so it goes there instead.
 */
export function useLocalTaskPaletteSelection({
  visible,
  taskItems,
  handleSelectWorktree,
  closeModal,
  recordFeatureInteraction,
  skipRestoreFocusRef,
  setSelectedItemId
}: Input): (item: LocalTaskPaletteItem, startWork?: boolean) => void {
  return useCallback(
    (item, startWork = false) => {
      if (!visible || !taskItems.some((candidate) => candidate.id === item.id)) {
        return
      }
      const domain = localTasksDomainStore.getState()
      const project = domain.projects.find((candidate) => candidate.id === item.task.projectId)
      const ownLink = findLocalTaskWorkspaceLink(domain.links, item.task.id)
      const start = project
        ? selectLocalTaskStartState(useAppStore.getState(), project, ownLink)
        : null
      if (startWork && start?.reason) {
        toast.error(start.reason)
        return
      }
      const workspace = startWork && start?.mode !== 'hidden' ? null : locateWorkspace(item)
      if (workspace) {
        handleSelectWorktree(workspace)
        return
      }
      skipRestoreFocusRef.current = true
      setSelectedItemId('')
      closeModal()
      recordFeatureInteraction('cmd-j')
      if (startWork && project && start?.mode !== 'hidden') {
        // Why the page first: picking an existing workspace is a dialog of the task page.
        if (start?.mode === 'existing') {
          openLocalTaskPage({ taskId: item.task.id })
        }
        // Why a microtask: the composer opens once the palette's own close has settled.
        queueMicrotask(() => runLocalTaskStart(item.task, project, ownLink))
        return
      }
      openLocalTaskPage({ taskId: item.task.id })
    },
    [
      visible,
      taskItems,
      handleSelectWorktree,
      closeModal,
      recordFeatureInteraction,
      skipRestoreFocusRef,
      setSelectedItemId
    ]
  )
}
