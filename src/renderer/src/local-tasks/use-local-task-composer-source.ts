import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { suggestLocalTaskWorkspaceName } from '../../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { localTaskPromptFor } from './local-task-session-launch'
import type { LocalTaskSourceTab } from './local-task-source-tab'
import {
  releaseLocalTaskComposer,
  rememberLocalTaskStart,
  type LocalTaskComposerStart
} from './local-task-start-work'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/** The composer fields the Local tasks pick reads and drives; all are the composer's own. */
type ComposerFields = {
  name: string
  onNameValueChange: (name: string) => void
  onClearSmartNameSelection: () => void
  selectedRepoExecutionHostId: ExecutionHostId | null
  selectedRepoProjectId: string | null
  selectedRepoIsGit: boolean
}

export type LocalTaskComposerSubmitOptions = {
  launchPrompt?: string
  onCreationStarted?: (creationId: string) => void
}

/** Why the picked task's pill left the composer, or null while nothing explains it. */
export function localTaskPickSetAsideReason(
  task: Pick<LocalTask, 'title'>,
  target: { folder: boolean; otherLibrary: boolean; taskLibraryLabel: string }
): string | null {
  if (target.folder) {
    return translate(
      'localTasks.sourceTab.setAsideFolder',
      'A folder can’t start work on “{{title}}”, so the task is set aside. Switch back to a Git repository to keep it.',
      { title: task.title }
    )
  }
  if (target.otherLibrary) {
    return translate(
      'localTasks.sourceTab.setAsideHost',
      '“{{title}}” is kept on {{library}}, so it can’t start work on this host. Switch back to keep it.',
      { title: task.title, library: target.taskLibraryLabel }
    )
  }
  return null
}

/** Says once why the pill went; switching back brings it back without another word. */
function useAnnounceSetAside(reason: string | null): void {
  const shown = useRef<string | null>(null)
  useEffect(() => {
    if (reason && reason !== shown.current) {
      toast.info(reason)
    }
    shown.current = reason
  }, [reason])
}

/**
 * The task the new-workspace composer is for (REQ-009): picked in its Local tasks tab or
 * preselected by Start, shown as the source pill, linked once the creation completes, and handed
 * to the agent as a draft. Only a git project's target offers it; a folder links existing work.
 */
export function useLocalTaskComposerSource(
  initial: LocalTaskComposerStart | undefined,
  card: ComposerFields
) {
  const [pick, setPick] = useState<LocalTaskComposerStart | null>(initial ?? null)
  const [initialMode] = useState(initial !== undefined)
  const pickedTaskId = pick?.taskId ?? null
  const task = useLocalTasksDomain((state) =>
    pickedTaskId === null
      ? null
      : (state.tasks.find((candidate) => candidate.id === pickedTaskId) ?? null)
  )
  const hostId =
    card.selectedRepoIsGit && card.selectedRepoProjectId ? card.selectedRepoExecutionHostId : null
  const endpoint = hostId ? localTaskEndpointForHost(hostId) : null
  const libraryLabel = useAppStore((state) =>
    endpoint ? selectExecutionHostDisplayLabel(state, endpoint) : ''
  )
  const taskLibraryLabel = useAppStore((state) =>
    task ? selectExecutionHostDisplayLabel(state, localTaskIdEndpoint(task.id)) : ''
  )
  // Why derived: a target on another Orca's host hides the pick; switching back shows it again.
  const selected: LocalTask | null =
    task && endpoint !== null && localTaskIdEndpoint(task.id) === endpoint ? task : null
  useAnnounceSetAside(
    task && !selected
      ? localTaskPickSetAsideReason(task, {
          folder: !card.selectedRepoIsGit && card.selectedRepoProjectId !== null,
          otherLibrary: endpoint !== null,
          taskLibraryLabel
        })
      : null
  )
  const { name, onNameValueChange, onClearSmartNameSelection } = card
  const select = useCallback(
    (next: LocalTask) => {
      onClearSmartNameSelection()
      // Why always: the name field doubled as the tab's search box, so its text was the query.
      onNameValueChange(suggestLocalTaskWorkspaceName(next.ref, next.title))
      setPick((current) =>
        current?.taskId === next.id
          ? current
          : { taskId: next.id, orcaProjectIds: [], replace: false }
      )
    },
    [onClearSmartNameSelection, onNameValueChange]
  )
  const clear = useCallback(() => {
    if (selected && name === suggestLocalTaskWorkspaceName(selected.ref, selected.title)) {
      onNameValueChange('')
    }
    setPick(null)
  }, [name, onNameValueChange, selected])
  const submitOptions = useCallback((): LocalTaskComposerSubmitOptions => {
    if (!selected || !pick) {
      return {}
    }
    return {
      launchPrompt: localTaskPromptFor(selected),
      onCreationStarted: (creationId: string) => {
        rememberLocalTaskStart(creationId, pick)
        releaseLocalTaskComposer()
        setPick(null)
      }
    }
  }, [pick, selected])
  const projectId = card.selectedRepoProjectId
  const selectedTaskId = selected?.id ?? null
  const pickedName = task ? suggestLocalTaskWorkspaceName(task.ref, task.title) : undefined
  const tab = useMemo<LocalTaskSourceTab | null>(
    () =>
      hostId && projectId
        ? {
            hostId,
            orcaProjectIds: [projectId],
            workspace: null,
            libraryLabel,
            selectedTaskId,
            initialMode,
            select,
            pickedName
          }
        : null,
    [hostId, initialMode, libraryLabel, pickedName, projectId, select, selectedTaskId]
  )
  const cardOverrides = useMemo(
    () =>
      selected
        ? {
            smartNameSelection: { kind: 'local-task' as const, label: selected.title },
            onClearSmartNameSelection: clear
          }
        : {},
    [clear, selected]
  )
  return { tab, cardOverrides, submitOptions }
}
