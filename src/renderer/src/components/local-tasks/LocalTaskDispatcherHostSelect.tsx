import { useStore } from 'zustand'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { localTaskDispatcherClientFor } from '@/local-tasks/local-task-dispatcher-client'
import {
  localTaskEnvironmentEndpoint,
  type LocalTaskEndpointKey
} from '@/local-tasks/local-task-endpoints'
import { isLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import {
  localTaskDispatcherStore,
  selectLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch
} from '@/local-tasks/local-task-dispatcher-source'
import { LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY } from '@/local-tasks/local-task-preference-keys'

export function LocalTaskDispatcherHostSelect(): React.JSX.Element {
  const endpoint = useStore(localTaskDispatcherStore, (state) => state.endpoint)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const options = [
    'local' as const,
    ...environments.map((environment) => localTaskEnvironmentEndpoint(environment.id))
  ]
  if (!options.includes(endpoint)) {
    options.push(endpoint)
  }
  const choose = async (next: LocalTaskEndpointKey): Promise<void> => {
    const previous = getLocalTaskDispatcherEndpoint()
    selectLocalTaskDispatcherEndpoint(next)
    const epoch = getLocalTaskDispatcherEpoch()
    try {
      const result = await localTaskDispatcherClientFor('local').setPreference(
        LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY,
        next
      )
      if (!result.ok) {
        throw new Error(result.code)
      }
    } catch {
      if (getLocalTaskDispatcherEndpoint() === next && getLocalTaskDispatcherEpoch() === epoch) {
        selectLocalTaskDispatcherEndpoint(previous)
      }
      toast.error(
        translate('localTasks.dispatcher.hostSaveFailed', 'Could not save the execution host.')
      )
    }
  }
  return (
    <Select
      value={endpoint}
      onValueChange={(value) => {
        const next = options.find((option) => option === value)
        if (next) {
          void choose(next)
        }
      }}
    >
      <SelectTrigger
        size="sm"
        density="compact"
        aria-label={translate('localTasks.dispatcher.executionHost', 'Execution host')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((hostId) => (
          <DispatcherHostOption key={hostId} hostId={hostId} />
        ))}
      </SelectContent>
    </Select>
  )
}

function DispatcherHostOption({ hostId }: { hostId: LocalTaskEndpointKey }): React.JSX.Element {
  const label = useAppStore((state) => selectLocalTaskHostLabel(state, hostId))
  const inContact = useAppStore((state) => isLocalTaskHostInContact(state, hostId))
  return (
    <SelectItem value={hostId} disabled={!inContact}>
      {label}
      {!inContact
        ? ` · ${translate('localTasks.dispatcher.hostUnavailable', 'Out of contact')}`
        : ''}
    </SelectItem>
  )
}
