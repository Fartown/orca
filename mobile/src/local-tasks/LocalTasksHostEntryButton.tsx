import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ListChecks, type LucideIcon } from 'lucide-react-native'
import { useOptionalHostProtocolGates } from '../components/host-protocol-gates-context'
import { hostScreenStyles } from '../host-screen/host-screen-styles'
import type { HostScreenController } from '../host-screen/use-host-screen-controller'
import { colors } from '../theme/mobile-theme'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRoutePath } from './local-tasks-route'

type HostController = Pick<
  HostScreenController,
  'hostId' | 'connState' | 'hostCapabilities' | 'embedded'
> & { actions: Pick<HostScreenController['actions'], 'navigateFromHostList'> }

/** Shaped like the host list's own actions, so it can join that list as one more entry. */
export type LocalTaskHostListAction = {
  id: 'local-tasks'
  label: string
  icon: LucideIcon
  onPress: () => void
  disabled: boolean
}

const ICON_SIZE = 16

/**
 * The host screen's way in. That screen is a page the desktop serves, so this reaches phones on an
 * App release that has no home card yet; the push lands on the catch-all route there. None unless
 * this host advertised `local-tasks.v1`. Kept for every user of such a host, projects or not: it
 * is where the first project is made.
 */
export function localTaskHostListActions(controller: HostController): LocalTaskHostListAction[] {
  if (!hostAdvertisesLocalTasks(controller.hostCapabilities)) {
    return []
  }
  const { actions, connState, hostId } = controller
  return [
    {
      id: 'local-tasks',
      label: localTasksCopy().hostEntryLabel,
      icon: ListChecks,
      onPress: () => actions.navigateFromHostList(localTasksRoutePath(hostId)),
      disabled: connState !== 'connected'
    }
  ]
}

/** Those actions as icon buttons of the host screen header's toolbar, sidebar or full screen. */
export function localTaskHostHeaderActions(controller: HostController): ReactNode {
  return <LocalTaskHostHeaderButtons controller={controller} />
}

function LocalTaskHostHeaderButtons({ controller }: { controller: HostController }) {
  const gates = useOptionalHostProtocolGates()
  const buttonStyle = controller.embedded
    ? hostScreenStyles.embeddedToolbarIconButton
    : hostScreenStyles.searchToggle
  const entries = localTaskHostListActions(controller)
  if (entries.length === 0) {
    // Why a blank slot until the host's status is read: the button arriving later would shift
    // Accounts and Tasks sideways on every first visit.
    return gates && !gates.statusReadable ? (
      <View
        style={buttonStyle}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.iconSlot} />
      </View>
    ) : null
  }
  return entries.map((action) => (
    <Pressable
      key={action.id}
      // Dimmed exactly as its neighbours are: only the sidebar's toolbar fades a disabled button.
      style={[
        buttonStyle,
        controller.embedded && action.disabled && hostScreenStyles.toolbarIconDisabled
      ]}
      onPress={action.onPress}
      disabled={action.disabled}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <action.icon
        size={ICON_SIZE}
        color={action.disabled ? colors.textMuted : colors.textSecondary}
      />
    </Pressable>
  ))
}

const styles = StyleSheet.create({
  iconSlot: { width: ICON_SIZE, height: ICON_SIZE }
})
