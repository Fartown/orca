import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { Pressable, Text, View } from 'react-native'
import { ArrowUpRight, ListTodo, MessageSquare } from 'lucide-react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { MobileSessionActiveContent } from '../session/MobileSessionActiveContent'
import { resolveMobileNativeChatSessionId } from '../session/native-chat/mobile-native-chat-eligibility'
import { useMobileSessionController } from '../session/use-mobile-session-controller'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { LocalTaskSessionSummary } from './local-task-card-facts'
import { localTasksCopy } from './local-tasks-copy'
import { LOCAL_TASK_SESSION_DOT } from './local-task-session-dots'
import { localTaskSessionPaneKey } from './local-task-work-navigation'
import type { LocalTasksApi } from './local-tasks-api'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/** Who the session is and how it stands, the task it works on, and where it runs. */
function DrawerHead(props: { summary: LocalTaskSessionSummary; now: number }) {
  const copy = localTasksCopy()
  const work = copy.work
  const { summary } = props
  const stateLabel = summary.item
    ? work.attentionKinds[summary.item.kind]
    : work.sessionStates[summary.state]
  const duration =
    summary.state === 'working' && summary.stateSince !== null
      ? work.card.duration(props.now - summary.stateSince)
      : null
  return (
    <View style={styles.head}>
      <View style={styles.headLine}>
        <AgentStateDot state={summary.item ? 'waiting' : LOCAL_TASK_SESSION_DOT[summary.state]} />
        <Text style={styles.agent}>{formatAgentTypeLabel(summary.link.agent)}</Text>
        <Text
          style={[styles.state, (summary.item || summary.state === 'working') && styles.attention]}
          numberOfLines={1}
        >
          {[stateLabel, duration].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {summary.task ? (
        <View style={styles.headLine}>
          <ListTodo size={12} color={colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {summary.task.title}
          </Text>
          <Text style={styles.ref}>{summary.task.ref}</Text>
        </View>
      ) : null}
      <View style={styles.headLine}>
        <MessageSquare size={12} color={colors.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>
          {[work.surfaces[summary.link.surface], summary.workspaceName, summary.hostName]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
    </View>
  )
}

function ChatContent(props: {
  hostId: string
  worktreeId: string
  session: LocalTaskSessionLink
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'live' | 'work'>
  summary: LocalTaskSessionSummary | null
  now: number
  onOpenFull?: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
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
      {props.summary ? (
        <DrawerHead summary={props.summary} now={props.now} />
      ) : (
        <Text style={styles.heading}>
          {props.session.agent ?? t('session.sheets.chat', 'Chat')}
        </Text>
      )}
      <MobileSessionActiveContent controller={controller} />
      {props.onOpenFull ? (
        <Pressable
          style={({ pressed }) => [styles.openFull, pressed && styles.pressed]}
          onPress={props.onOpenFull}
          accessibilityRole="button"
          testID="local-task-session-open-full"
        >
          <ArrowUpRight size={15} color={colors.textPrimary} />
          <Text style={styles.openFullText}>{localTasksCopy().work.card.openFullSession}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** A chat session answered in place (Q2); terminal sessions open their own page instead. */
export function LocalTaskSessionDrawer(props: {
  hostId: string
  worktreeId: string | null
  session: LocalTaskSessionLink | null
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'live' | 'work'>
  /** The drawer's head; without one it names only the agent. */
  summary?: LocalTaskSessionSummary | null
  now?: number
  /** Opens the session's own page; the drawer closes behind it. */
  onOpenFull?: () => void
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
          summary={props.summary ?? null}
          now={props.now ?? 0}
          onOpenFull={props.onOpenFull}
        />
      ) : null}
    </BottomDrawer>
  )
}

const styles = themedStyleSheet(() => ({
  content: { flex: 1, minHeight: 0, backgroundColor: colors.bgBase },
  heading: {
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  head: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle
  },
  headLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  agent: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' as const },
  state: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  attention: { color: colors.statusAmber },
  meta: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  ref: {
    color: colors.textMuted,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  openFull: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.bgRaised
  },
  openFullText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600' as const
  },
  pressed: { opacity: 0.7 }
}))
