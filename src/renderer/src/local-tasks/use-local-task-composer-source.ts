import { useCallback, useMemo, useState } from 'react'
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
  // Why derived: a target on another Orca's host hides the pick; switching back shows it again.
  const selected: LocalTask | null =
    task && endpoint !== null && localTaskIdEndpoint(task.id) === endpoint ? task : null
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
            select
          }
        : null,
    [hostId, initialMode, libraryLabel, projectId, select, selectedTaskId]
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
