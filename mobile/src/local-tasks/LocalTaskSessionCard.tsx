import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, ClipboardList } from 'lucide-react-native'
import { AgentStateDot } from '../agents/presentation/AgentStateDot'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import { useRouteHandoff } from '../navigation/route-handoff'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRouteHref } from './local-tasks-route'
import { localTaskEndpointFor } from './local-task-endpoint'
import type { SessionLinkRequest } from './local-task-session-link-sheet'
import { safePaneKey, useLocalTaskSessionStrip } from './use-local-task-session-strip'

type CardController = {
  hostId: string | undefined
  worktreeId: string
  activeSessionTab: MobileSessionTab | null | undefined
}

/**
 * The ids a session link records for the open tab, as the route's host names them (which is the
 * library's own form, D-008); null when the tab is not an agent.
 */
function sessionIdsFor(tab: MobileSessionTab | null | undefined) {
  if (tab?.type === 'agent-session') {
    return { surface: 'chat' as const, sessionId: tab.sessionId, tabId: tab.id }
  }
  if (tab?.type !== 'terminal' || (!tab.launchAgent && !tab.agentStatus)) {
    return null
  }
  const tabId = tab.parentTabId ?? tab.id
  const paneKey = tab.leafId ? safePaneKey(tabId, tab.leafId) : null
  return { surface: 'terminal' as const, tabId, ...(paneKey ? { paneKey } : {}) }
}

/** The tab detail card names the task of the tab that opened it. */
export function LocalTaskSessionCard({
  controller,
  onOpenTask,
  onLinkSession
}: {
  controller: CardController
  onOpenTask?: () => void
  onLinkSession?: (request: SessionLinkRequest) => void
}) {
  useMobileColorScheme()
  const copy = localTasksCopy()
  const t = useMobileTranslation()
  const router = useRouteHandoff()
  const executionHost = useWorkspaceExecutionHost()
  const endpoint = useMemo(() => localTaskEndpointFor(executionHost), [executionHost])
  const activeTab = controller.activeSessionTab ?? null
  const strip = useLocalTaskSessionStrip(controller.hostId, endpoint, {
    worktreeId: controller.worktreeId,
    activeSessionTab: activeTab
  })
  if (!strip.line || !controller.hostId) {
    return null
  }
  const hostId = controller.hostId
  const { task, workspace } = strip.line
  const linkable = strip.live && workspace && !strip.openSession ? sessionIdsFor(activeTab) : null
  const openState = strip.openSession
    ? strip.liveProgress?.sessions.find((entry) => entry.taskSessionId === strip.openSession?.id)
        ?.state
    : undefined
  const attentionState = openState === 'waiting' || openState === 'blocked' ? openState : null
  const status = strip.live
    ? attentionState
      ? copy.work.sessionStates[attentionState]
      : null
    : copy.work.sessionStates.unverifiable
  const openTask = () => {
    onOpenTask?.()
    router.push(
      localTasksRouteHref(hostId, { taskId: task.id }, { executionHost: endpoint.executionHost })
    )
  }

  return (
    <View style={styles.cardSection} testID="local-task-session-card">
      <Pressable
        style={styles.taskTarget}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.ref}`}
        accessibilityHint={t('localTasks.work.openTask', 'Open task')}
        onPress={openTask}
      >
        <ClipboardList size={16} color={colors.textSecondary} />
        <View style={styles.taskIdentity}>
          <Text style={styles.taskText} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={styles.refText}>{task.ref}</Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </Pressable>
      {status ? (
        <View style={styles.state} testID="local-task-card-state">
          {strip.live && attentionState ? <AgentStateDot state={attentionState} /> : null}
          <Text style={styles.stateText} numberOfLines={1}>
            {status}
          </Text>
        </View>
      ) : null}
      {linkable && workspace && strip.client && onLinkSession ? (
        <Pressable
          style={styles.target}
          accessibilityRole="button"
          onPress={() =>
            onLinkSession({
              hostId,
              worktreeId: controller.worktreeId,
              activeSessionTab: activeTab,
              workspaceTaskId: workspace.taskId,
              record: {
                hostId: workspace.hostId,
                ...(workspace.worktreeId ? { worktreeId: workspace.worktreeId } : {}),
                ...linkable
              }
            })
          }
        >
          <Text style={styles.action}>{copy.work.linkSessionToTask}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  cardSection: { width: '100%', gap: spacing.xs, paddingTop: spacing.sm },
  taskTarget: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  taskIdentity: { flex: 1, gap: spacing.xs },
  taskText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  refText: { color: colors.textMuted, fontSize: typography.metaSize },
  target: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stateText: { color: colors.textSecondary, fontSize: typography.metaSize },
  action: { color: colors.textSecondary, fontSize: typography.metaSize }
}))
