import { Pressable } from 'react-native'
import { ListChecks } from 'lucide-react-native'
import { useOptionalHostProtocolGates } from '../components/host-protocol-gates-context'
import { hostScreenStyles } from '../host-screen/host-screen-styles'
import type { HostScreenController } from '../host-screen/use-host-screen-controller'
import { colors } from '../theme/mobile-theme'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRoutePath } from './local-tasks-route'

/**
 * The host screen's way in. That screen is a page the desktop serves, so this reaches phones on an
 * App release that has no home card yet; the push lands on the catch-all route there. Hidden unless
 * this host advertised `local-tasks.v1`.
 */
export function LocalTasksHostEntryButton(props: {
  controller: Pick<HostScreenController, 'hostId' | 'connState' | 'actions'>
  variant: 'embedded' | 'toolbar'
}) {
  const gates = useOptionalHostProtocolGates()
  if (!hostAdvertisesLocalTasks(gates?.hostCapabilities)) {
    return null
  }
  const { hostId, connState, actions } = props.controller
  const connected = connState === 'connected'
  return (
    <Pressable
      style={[
        props.variant === 'embedded'
          ? hostScreenStyles.embeddedToolbarIconButton
          : hostScreenStyles.searchToggle,
        !connected && hostScreenStyles.toolbarIconDisabled
      ]}
      onPress={() => actions.navigateFromHostList(localTasksRoutePath(hostId))}
      disabled={!connected}
      accessibilityRole="button"
      accessibilityLabel={localTasksCopy().hostEntryLabel}
    >
      <ListChecks size={16} color={connected ? colors.textSecondary : colors.textMuted} />
    </Pressable>
  )
}
