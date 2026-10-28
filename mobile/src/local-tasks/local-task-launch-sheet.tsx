import { useState } from 'react'
import { Bot, FolderPlus, MapPin, Send, TextCursorInput } from 'lucide-react-native'
import { ActionSheetModal, type ActionSheetAction } from '../components/ActionSheetModal'
import { PickerModal } from '../components/PickerModal'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskSetup } from './local-task-project-setups'
import type { LocalTaskLaunchController } from './use-local-task-launch'

/** The host a launch runs on, as the user knows it. */
export function localTaskHostLabel(hostId: string, label: string | null | undefined): string {
  return label?.trim() || (hostId === 'local' ? localTasksCopy().work.hostLocal : hostId)
}

/** A checkout as Start lists it: its repo, and the host it runs on. */
export function localTaskSetupLabel(
  setup: Pick<LocalTaskSetup, 'hostId' | 'label'>,
  hostLabels: ReadonlyMap<string, string>
): string {
  return [setup.label, localTaskHostLabel(setup.hostId, hostLabels.get(setup.hostId))]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Start and Open-a-session ask the same three things: where (Start only: which of the project's
 * repos, on which host), how the prompt arrives, and which agent. Picking the agent is the commit.
 */
export function LocalTaskLaunchSheet(props: {
  launch: LocalTaskLaunchController
  hostLabels: ReadonlyMap<string, string>
  /** The linked workspace's host as the caller names it, for Open a session. */
  workspaceHostLabel: string
}) {
  const work = localTasksCopy().work
  const { launch } = props
  const [pickingSetup, setPickingSetup] = useState(false)
  const request = launch.request
  const hostLabel = request
    ? request.mode === 'start'
      ? localTaskSetupLabel(request.setup, props.hostLabels)
      : props.workspaceHostLabel
    : ''
  const actions: ActionSheetAction[] = []
  if (
    request?.mode === 'start' &&
    request.setups.filter((setup) => setup.kind === 'git').length > 1
  ) {
    actions.push({
      label: work.changeLocation,
      hint: hostLabel,
      icon: MapPin,
      closeBeforePress: true,
      onPress: () => setPickingSetup(true)
    })
  }
  actions.push({
    label: launch.delivery === 'submit' ? work.sendNow : work.sendAsDraft,
    hint: launch.delivery === 'submit' ? work.deliveryHintSubmit : work.deliveryHintDraft,
    icon: launch.delivery === 'submit' ? Send : TextCursorInput,
    skipAutoClose: true,
    onPress: launch.toggleDelivery
  })
  if (launch.agents.status === 'loading') {
    actions.push({ label: work.loadingAgents, loading: true, disabled: true, onPress: () => {} })
  } else {
    for (const option of launch.agents.status === 'ready' ? launch.agents.agents : []) {
      actions.push({
        label: option.label,
        icon: Bot,
        onPress: () => void launch.launch(option.agent, hostLabel)
      })
    }
    if (
      request?.mode !== 'start' &&
      (launch.agents.status === 'failed' || launch.agents.agents.length === 0)
    ) {
      actions.push({ label: work.noAgents, disabled: true, onPress: () => {} })
    }
  }
  if (request?.mode === 'start') {
    actions.push({
      label: work.workspaceOnly,
      hint: work.workspaceOnlyHint,
      icon: FolderPlus,
      onPress: () => void launch.launch(null, hostLabel)
    })
  }
  return (
    <>
      <ActionSheetModal
        visible={request !== null && !pickingSetup}
        title={
          request
            ? request.mode === 'start'
              ? work.startTitle(request.sessionTask.ref)
              : work.openSessionTitle(request.sessionTask.ref)
            : undefined
        }
        message={request?.mode === 'start' ? work.startWhere(request.name, hostLabel) : undefined}
        actions={actions}
        onClose={() => {
          if (!pickingSetup) {
            launch.close()
          }
        }}
      />
      <PickerModal
        visible={pickingSetup && request?.mode === 'start'}
        title={work.pickLocation}
        options={
          request?.mode === 'start'
            ? request.setups
                .filter((setup) => setup.kind === 'git')
                .map((setup) => ({
                  value: `${setup.hostId}\u0000${setup.repoId}`,
                  label: localTaskSetupLabel(setup, props.hostLabels)
                }))
            : []
        }
        selected={
          request?.mode === 'start' ? `${request.setup.hostId}\u0000${request.setup.repoId}` : ''
        }
        onSelect={(value) => {
          const setup =
            request?.mode === 'start'
              ? request.setups.find((entry) => `${entry.hostId}\u0000${entry.repoId}` === value)
              : undefined
          if (setup) {
            void launch.chooseSetup(setup, localTaskSetupLabel(setup, props.hostLabels))
          }
        }}
        onClose={() => setPickingSetup(false)}
      />
    </>
  )
}
