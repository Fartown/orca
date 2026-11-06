import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { Text, View } from 'react-native'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { MobileSessionActiveContent } from '../session/MobileSessionActiveContent'
import { resolveMobileNativeChatSessionId } from '../session/native-chat/mobile-native-chat-eligibility'
import { useMobileSessionController } from '../session/use-mobile-session-controller'
import { colors, spacing } from '../theme/mobile-theme'
import { localTaskSessionPaneKey } from './local-task-work-navigation'
import type { LocalTasksApi } from './local-tasks-api'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'
import type { LocalTasksLibrary } from './use-local-tasks-library'

function ChatContent(props: {
  hostId: string
  worktreeId: string
  session: LocalTaskSessionLink
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'live' | 'work'>
}) {
  useMobileColorScheme()
  const controller = useMobileSessionController({
    hostId: props.hostId,
    worktreeId: props.worktreeId,
    paneKey: localTaskSessionPaneKey(props.session)
  })
  const activeTab = controller.activeSessionTab
  const matchesSession =
    activeTab !== null &&
    ((props.session.sessionId !== null &&
      resolveMobileNativeChatSessionId(activeTab) === props.session.sessionId) ||
      (props.session.sessionId === null &&
        props.session.tabId !== null &&
        activeTab.id === props.session.tabId))
  const visibleSessionId =
    props.library.live &&
    controller.connState === 'connected' &&
    controller.nativeChatController.sessionViewReady &&
    controller.nativeChatController.showNativeChat &&
    matchesSession &&
    !controller.showLoadingState &&
    !controller.showEmptyState &&
    !controller.showOfflineState
      ? props.session.id
      : null
  useAcknowledgeOpenSession(
    controller.client,
    visibleSessionId,
    props.library.work.progress,
    props.api
  )
  return (
    <View style={styles.content}>
      <Text style={styles.heading}>{props.session.agent ?? 'Chat'}</Text>
      <MobileSessionActiveContent controller={controller} />
    </View>
  )
}

export function LocalTaskSessionDrawer(props: {
  hostId: string
  worktreeId: string | null
  session: LocalTaskSessionLink | null
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'live' | 'work'>
  onClose: () => void
}) {
  const session = props.session
  return (
    <BottomDrawer
      visible={session !== null && props.worktreeId !== null}
      onClose={props.onClose}
      fillAvailable
      contentScrollable={false}
    >
      {session && props.worktreeId ? (
        <ChatContent
          key={session.id}
          hostId={props.hostId}
          worktreeId={props.worktreeId}
          session={session}
          api={props.api}
          library={props.library}
        />
      ) : null}
    </BottomDrawer>
  )
}

const styles = themedStyleSheet(() => ({
  content: { flex: 1, minHeight: 0, backgroundColor: colors.bgBase },
  heading: { color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }
}))
