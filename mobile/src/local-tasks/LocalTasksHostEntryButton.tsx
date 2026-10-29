import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import { ListChecks, type LucideIcon } from 'lucide-react-native'
import { hostScreenStyles } from '../host-screen/host-screen-styles'
import type { HostScreenController } from '../host-screen/use-host-screen-controller'
import { colors } from '../theme/mobile-theme'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRoutePath } from './local-tasks-route'

type HostController = Pick<
  HostScreenController,
  'hostId' | 'connState' | 'actions' | 'hostCapabilities' | 'embedded'
>

/** Shaped like the host list's own actions, so it can join that list as one more entry. */
export type LocalTaskHostListAction = {
  id: 'local-tasks'
  label: string
  icon: LucideIcon
  onPress: () => void
  disabled: boolean
}

/**
 * The host screen's way in. That screen is a page the desktop serves, so this reaches phones on an
 * App release that has no home card yet; the push lands on the catch-all route there. None unless
 * this host advertised `local-tasks.v1`.
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
  return localTaskHostListActions(controller).map((action) => (
    <Pressable
      key={action.id}
      style={[
        controller.embedded
          ? hostScreenStyles.embeddedToolbarIconButton
          : hostScreenStyles.searchToggle,
        action.disabled && hostScreenStyles.toolbarIconDisabled
      ]}
      onPress={action.onPress}
      disabled={action.disabled}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <action.icon size={16} color={action.disabled ? colors.textMuted : colors.textSecondary} />
    </Pressable>
  ))
}
