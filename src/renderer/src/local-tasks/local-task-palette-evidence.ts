import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  composePaletteEvidence,
  type PaletteComposedEvidence
} from '@/lib/palette-match/evidence-composer'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { selectLocalTaskSourceVisible } from './local-task-source-visibility'
import { localTaskWorktreeHostId } from './local-task-workspace-resolution'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/** Cmd+J match evidence for the task a workspace belongs to, so `SHOP-12` finds its workspace. */
export type LocalTaskWorkspaceEvidence = (worktree: Worktree) => PaletteComposedEvidence | null

export function buildLocalTaskWorkspaceEvidence(
  links: LocalTaskLinks,
  tasks: readonly LocalTask[],
  hostIdOf: (worktree: Worktree) => string
): LocalTaskWorkspaceEvidence | undefined {
  if (links.workspaces.length === 0) {
    return undefined
  }
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  return (worktree) => {
    const link = findLocalTaskLinkForWorkspace(links, {
      id: worktree.id,
      hostId: hostIdOf(worktree),
      ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
    })
    const task = link ? tasksById.get(link.taskId) : undefined
    if (!task) {
      return null
    }
    return composePaletteEvidence({
      id: `local-task:${task.id}`,
      kind: 'task',
      accessibilityLabel: 'Linked local task',
      parts: [
        { key: 'identifier', text: task.ref, profile: 'identifier', identifier: { kind: 'key' } },
        { key: 'title', text: task.title, profile: 'prose' }
      ]
    })
  }
}

/** Nothing while Settings → Task sources hides Local, like every other Cmd+J local result. */
export function useLocalTaskWorkspaceEvidence(): LocalTaskWorkspaceEvidence | undefined {
  const links = useLocalTasksDomain((state) => state.links)
  // Why only linked tasks: an edit to any other task must not rebuild every palette document.
  const linkedTasks = useLocalTasksDomain(
    useShallow((state) => {
      const linkedIds = new Set(state.links.workspaces.map((link) => link.taskId))
      return state.tasks.filter((task) => linkedIds.has(task.id))
    })
  )
  const visible = useLocalTasksDomain(selectLocalTaskSourceVisible)
  return useMemo(
    () =>
      visible
        ? buildLocalTaskWorkspaceEvidence(links, linkedTasks, (worktree) =>
            localTaskWorktreeHostId(useAppStore.getState(), worktree)
          )
        : undefined,
    [visible, links, linkedTasks]
  )
}
