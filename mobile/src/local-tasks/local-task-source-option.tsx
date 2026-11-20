import { useMemo } from 'react'
import type { TaskProvider } from '../../../src/shared/work-items/task-providers'
import type { PickerOption } from '../components/sheets/PickerModal'
import { useOptionalHostProtocolGates } from '../components/host-connection/host-protocol-gates-context'
import type { RouteHandoff } from '../navigation/route-handoff'
import { ListTodo } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { ConnectionState } from '../transport/connection/connection-state'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { useLocalTaskSourceHidden } from './local-task-library-presence'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRoutePath } from './local-tasks-route'

/** The Task Source picker's Local row. Not a `TaskProvider`, so it never becomes the saved source. */
export const LOCAL_TASK_SOURCE_OPTION = 'local-tasks'

export type LocalTaskSourceOption = typeof LOCAL_TASK_SOURCE_OPTION

/**
 * The Task Source picker's Local row, put ahead of the upstream sources as on the desktop's source
 * bar (REQ-008). None unless the host advertises `local-tasks.v1`, and none once its user is known to
 * have hidden local tasks there. Offered with no project yet, like the desktop's Local button: the
 * page it opens is where the first project is made, and no other way in is left on this screen.
 * Dimmed out of contact. Costs one `localTasks.status` per contact with a host that has local tasks.
 */
export function useLocalTaskSourceOptions(page: {
  client: RpcClient | null
  connState: ConnectionState
}): PickerOption<LocalTaskSourceOption>[] {
  const gates = useOptionalHostProtocolGates()
  const advertises = hostAdvertisesLocalTasks(gates?.hostCapabilities)
  const connected = page.connState === 'connected'
  const hidden = useLocalTaskSourceHidden(advertises ? page.client : null, connected)
  return useMemo(() => {
    if (!advertises || hidden) {
      return []
    }
    const copy = localTasksCopy()
    return [
      {
        value: LOCAL_TASK_SOURCE_OPTION,
        label: copy.sourceLabel,
        // A dimmed row says why, as the picker's other disabled rows do.
        subtitle: connected ? copy.sourceSubtitle : copy.desktopDisconnected(''),
        disabled: !connected,
        renderIcon: (selected: boolean) => (
          <ListTodo size={16} color={selected ? colors.textPrimary : colors.textSecondary} />
        )
      }
    ]
  }, [advertises, hidden, connected])
}

/**
 * The picker's selection, with Local opening the local tasks page. The host's `defaultTaskSource`
 * is left as it was: it names an upstream provider, which the desktop and older phones read.
 */
export function withLocalTaskSource(
  page: { hostId: string; router: Pick<RouteHandoff, 'push'> },
  selectProvider: (provider: TaskProvider) => void
): (next: TaskProvider | LocalTaskSourceOption) => void {
  return (next) => {
    if (next === LOCAL_TASK_SOURCE_OPTION) {
      page.router.push(localTasksRoutePath(page.hostId))
      return
    }
    selectProvider(next)
  }
}
