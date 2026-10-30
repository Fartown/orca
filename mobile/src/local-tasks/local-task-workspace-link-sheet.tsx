import { useState } from 'react'
import type { LocalTaskLinks } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { localTaskListedHostId, type LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import type { LocalTaskSetup } from './local-task-project-setups'
import {
  localTaskCandidatesForProject,
  localTaskLinkHolding,
  localTaskLinkParamsFor
} from './local-task-workspace-candidates'
import { localTaskHostLabel } from './local-task-launch-sheet'
import { useLocalTaskWorkspaceCandidates } from './use-local-task-workspace-candidates'

/**
 * "Link an existing workspace": the workspaces of this task's project on the library's own host
 * (every repo there when the project has none), folder workspaces included. A workspace another task
 * holds is greyed out with that task's ref.
 */
export function LocalTaskWorkspaceLinkSheet(props: {
  visible: boolean
  task: LocalTask
  tasks: readonly LocalTask[]
  setups: readonly LocalTaskSetup[]
  links: LocalTaskLinks
  hostLabels: ReadonlyMap<string, string>
  site: Pick<LocalTaskSite, 'client' | 'endpoint' | 'hostId'>
  api: LocalTasksApi
  onLinked: () => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [error, setError] = useState<string | null>(null)
  const { site } = props
  const state = useLocalTaskWorkspaceCandidates({
    client: site.client,
    key: site.endpoint.executionHost ?? site.hostId,
    open: props.visible
  })
  const listedOf = (ownerHostId: string) =>
    localTaskListedHostId(site.endpoint, ownerHostId) ?? ownerHostId
  const labelOf = (ownerHostId: string) =>
    localTaskHostLabel(listedOf(ownerHostId), props.hostLabels.get(listedOf(ownerHostId)))
  const titles = new Map(props.tasks.map((task) => [task.id, task.title]))
  const candidates =
    state.status === 'ready' ? localTaskCandidatesForProject(state.candidates, props.setups) : []
  const link = async (index: number) => {
    const candidate = candidates[index]
    if (!candidate) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      ids,
      {
        taskId: props.task.id,
        ...localTaskLinkParamsFor(
          candidate,
          props.hostLabels.get(listedOf(candidate.hostId)) ?? ''
        ),
        linkedVia: 'manual' as const
      },
      props.api.linkWorkspace
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      props.onLinked()
    }
  }
  return (
    <LocalTaskChoiceSheet
      visible={props.visible}
      title={copy.work.linkExistingTitle(props.task.title)}
      loading={state.status === 'loading'}
      message={
        state.status === 'failed'
          ? copy.loadFailed
          : state.status === 'ready' && candidates.length === 0
            ? copy.work.noWorkspacesToLink
            : null
      }
      error={error}
      choices={candidates.map((candidate, index) => {
        const holder = localTaskLinkHolding(props.links, candidate)
        const host = labelOf(candidate.hostId)
        return {
          key: `${candidate.hostId}|${candidate.worktreeId}`,
          label: candidate.displayName,
          subtitle: holder
            ? copy.work.workspaceTaken(titles.get(holder.taskId) ?? '')
            : [host, candidate.branch].filter(Boolean).join(' · '),
          disabled: holder !== null,
          onPress: () => void link(index)
        }
      })}
      onClose={() => {
        setError(null)
        props.onClose()
      }}
    />
  )
}
