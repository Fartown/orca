import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ClipboardList } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { useResponsiveLayout } from '../layout/responsive-layout'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import { useRouteHandoff } from '../navigation/route-handoff'
import type { MobileSessionTab } from '../session/mobile-session-route-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSendParams } from '../transport/rpc-params-contract'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRouteHref } from './local-tasks-route'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { localTaskEndpointFor } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { safePaneKey, useLocalTaskSessionStrip } from './use-local-task-session-strip'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'

type StripController = {
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

/**
 * The session header's task line, shown only for a session or workspace linked to a task: "SHOP-13 ·
 * title" opens the task, and an agent tab of a linked workspace can be linked to its task or a
 * subtask. Anything else keeps upstream's header height: an unlinked workspace is linked from the
 * host list's long-press or the task page, and a sideways phone gets no extra row at all.
 *
 * Once shown it stays through a dropped connection, marked unverifiable, so the terminal below is
 * never refit by a connection change.
 */
export function LocalTaskSessionStrip({ controller }: { controller: StripController }) {
  const copy = localTasksCopy()
  const router = useRouteHandoff()
  const executionHost = useWorkspaceExecutionHost()
  const endpoint = useMemo(() => localTaskEndpointFor(executionHost), [executionHost])
  const activeTab = controller.activeSessionTab ?? null
  const strip = useLocalTaskSessionStrip(controller.hostId, endpoint, {
    worktreeId: controller.worktreeId,
    activeSessionTab: activeTab
  })
  const { isLandscapePhone } = useResponsiveLayout()
  useAcknowledgeOpenSession(
    strip.live ? strip.client : null,
    strip.openSession?.id ?? null,
    strip.liveProgress
  )
  if (!strip.line || !controller.hostId || isLandscapePhone) {
    return null
  }
  const hostId = controller.hostId
  const { task, workspace, sessionChoices } = strip.line
  const linkable = strip.live && workspace && !strip.openSession ? sessionIdsFor(activeTab) : null

  return (
    <View style={styles.strip}>
      <ClipboardList size={12} color={colors.textMuted} />
      <Pressable
        style={styles.grow}
        accessibilityRole="button"
        onPress={() =>
          router.push(
            localTasksRouteHref(
              hostId,
              { taskId: task.id },
              { executionHost: endpoint.executionHost }
            )
          )
        }
      >
        <Text style={styles.task} numberOfLines={1}>
          {task.ref} · {task.title}
        </Text>
      </Pressable>
      {/* Same line height as the task, so going out of contact never changes the row. */}
      {strip.live ? null : (
        <Text style={styles.action} numberOfLines={1}>
          {copy.work.sessionStates.unverifiable}
        </Text>
      )}
      {linkable && workspace && strip.client ? (
        <LinkSessionAction
          client={strip.client}
          record={{
            hostId: workspace.hostId,
            ...(workspace.worktreeId ? { worktreeId: workspace.worktreeId } : {}),
            ...linkable
          }}
          choices={sessionChoices}
          onLinked={strip.reload}
        />
      ) : null}
    </View>
  )
}

/** "Link this session…" and its sheet of the tasks the session may be recorded on. */
function LinkSessionAction(props: {
  client: RpcClient
  record: Omit<
    RpcSendParams<'localTasks.links.recordSession'>,
    'taskId' | 'linkedVia' | 'clientOperationId'
  >
  choices: readonly LocalTask[]
  onLinked: () => void
}) {
  const copy = localTasksCopy()
  const [open, setOpen] = useState(false)
  const [sessionIds] = useState(() => createLocalTaskOperationIds())
  const [error, setError] = useState<string | null>(null)
  const linkSession = async (taskId: string) => {
    const outcome = await sendLocalTaskWrite(
      sessionIds,
      { ...props.record, taskId, linkedVia: 'manual' as const },
      createLocalTasksApi(props.client).recordSession
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      setOpen(false)
      props.onLinked()
    }
  }
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={styles.action}>{copy.work.linkSessionToTask}</Text>
      </Pressable>
      <LocalTaskChoiceSheet
        visible={open}
        title={copy.work.linkSessionTitle}
        error={error}
        choices={props.choices.map((entry) => ({
          key: entry.id,
          label: `${entry.ref} · ${entry.title}`,
          onPress: () => void linkSession(entry.id)
        }))}
        onClose={() => {
          setError(null)
          setOpen(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs
  },
  grow: { flex: 1, minWidth: 0 },
  task: { color: colors.textSecondary, fontSize: typography.metaSize },
  action: { color: colors.textMuted, fontSize: typography.metaSize }
})
