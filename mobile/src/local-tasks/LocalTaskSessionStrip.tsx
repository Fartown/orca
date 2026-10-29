import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ClipboardList } from 'lucide-react-native'
import { localTaskEffectiveWorkspace } from '../../../src/shared/local-tasks/local-task-tree'
import { parseWorkspaceKey } from '../../../src/shared/workspace-scope'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import { useRouteHandoff } from '../navigation/route-handoff'
import type { MobileSessionTab } from '../session/mobile-session-route-types'
import { getRepoIdFromMobileWorktreeId } from '../session/mobile-session-route-helpers'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { worktreeCatalogRead } from '../worktree/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRouteHref } from './local-tasks-route'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { localTaskEndpointFor } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { LocalTaskLinkToTaskSheet } from './local-task-link-to-task-sheet'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import {
  localTaskSessionForTab,
  localTaskWorkspaceForRoute,
  safePaneKey,
  useLocalTaskSessionStrip
} from './use-local-task-session-strip'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'

type StripController = {
  hostId: string | undefined
  worktreeId: string
  worktreeName?: string | null
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
 * The session header's task line: "SHOP-13 · title" opens the task; an unlinked workspace offers
 * "Link to task…", and an agent tab in a linked workspace can be linked to its task or a subtask.
 */
export function LocalTaskSessionStrip({ controller }: { controller: StripController }) {
  const copy = localTasksCopy()
  const router = useRouteHandoff()
  const executionHost = useWorkspaceExecutionHost()
  const endpoint = useMemo(() => localTaskEndpointFor(executionHost), [executionHost])
  const strip = useLocalTaskSessionStrip(controller.hostId, endpoint)
  const [linkTarget, setLinkTarget] = useState<LocalTaskWorkspaceCandidate | null>(null)
  const [linkingSession, setLinkingSession] = useState(false)
  const [sessionIds] = useState(() => createLocalTaskOperationIds())
  const [error, setError] = useState<string | null>(null)
  const openSession = strip.data
    ? localTaskSessionForTab(strip.data.links.sessions, controller.activeSessionTab ?? null)
    : null
  useAcknowledgeOpenSession(
    strip.advertised ? strip.client : null,
    openSession?.id ?? null,
    strip.data?.progress ?? null
  )
  if (!strip.advertised || !strip.data || !controller.hostId) {
    return null
  }
  const hostId = controller.hostId
  const { links, tasks } = strip.data
  const workspace = localTaskWorkspaceForRoute(links.workspaces, controller.worktreeId)
  const session = openSession
  const task = tasks.find((entry) => entry.id === (session?.taskId ?? workspace?.taskId)) ?? null
  const linkable = workspace && !session ? sessionIdsFor(controller.activeSessionTab) : null

  const openLinkSheet = async () => {
    // A server's workspace goes as `runtime:E` and the sheet asks that server which of its hosts it
    // is on. On the paired host no host is guessed: `local` would misfile an SSH workspace, so one
    // its own list does not name stays unlinkable.
    const fallback: LocalTaskWorkspaceCandidate = {
      worktreeId: controller.worktreeId,
      repoId: getRepoIdFromMobileWorktreeId(controller.worktreeId),
      hostId: executionHost ?? '',
      displayName: controller.worktreeName || controller.worktreeId,
      branch: '',
      instanceId: null,
      folderWorkspaceId: (() => {
        const scope = parseWorkspaceKey(controller.worktreeId)
        return scope?.type === 'folder' ? scope.folderWorkspaceId : null
      })()
    }
    if (executionHost || !strip.desktopClient) {
      setLinkTarget(fallback)
      return
    }
    // Why the desktop's list: it names the SSH host and the instance id the route does not carry.
    const listed = await worktreeCatalogRead
      .requestSingleFlight(strip.desktopClient, hostId, { limit: WORKTREE_PS_FULL_LIMIT })
      .then((reply) => {
        const catalog = worktreeCatalogRead.interpret(reply)
        return catalog.accepted
          ? readLocalTaskWorkspaceCandidates(catalog.value.worktrees ?? [])
          : []
      })
      .catch(() => [])
    setLinkTarget(listed.find((row) => row.worktreeId === controller.worktreeId) ?? fallback)
  }
  const linkSession = async (taskId: string) => {
    if (!workspace || !linkable || !strip.client) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      sessionIds,
      {
        taskId,
        hostId: workspace.hostId,
        ...(workspace.worktreeId ? { worktreeId: workspace.worktreeId } : {}),
        ...linkable,
        linkedVia: 'manual' as const
      },
      createLocalTasksApi(strip.client).recordSession
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      setLinkingSession(false)
      strip.reload()
    }
  }
  // The workspace's task and every task below it that works in this same workspace (REQ-011).
  const tasksById = new Map(tasks.map((entry) => [entry.id, entry]))
  const workspacesByTaskId = new Map(links.workspaces.map((link) => [link.taskId, link]))
  const sessionChoices = workspace
    ? tasks
        .filter(
          (entry) => localTaskEffectiveWorkspace(entry, tasksById, workspacesByTaskId) === workspace
        )
        .sort((a, b) => a.number - b.number)
    : []

  return (
    <View style={styles.strip}>
      <ClipboardList size={12} color={colors.textMuted} />
      {task ? (
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
      ) : (
        <Pressable
          style={styles.grow}
          accessibilityRole="button"
          onPress={() => void openLinkSheet()}
        >
          <Text style={styles.action}>{copy.work.linkToTask}</Text>
        </Pressable>
      )}
      {linkable ? (
        <Pressable accessibilityRole="button" onPress={() => setLinkingSession(true)}>
          <Text style={styles.action}>{copy.work.linkSessionToTask}</Text>
        </Pressable>
      ) : null}
      <LocalTaskLinkToTaskSheet
        target={linkTarget}
        hostLabel=""
        client={strip.desktopClient}
        onLinked={strip.reload}
        onClose={() => setLinkTarget(null)}
      />
      <LocalTaskChoiceSheet
        visible={linkingSession}
        title={copy.work.linkSessionTitle}
        error={error}
        choices={sessionChoices.map((entry) => ({
          key: entry.id,
          label: `${entry.ref} · ${entry.title}`,
          onPress: () => void linkSession(entry.id)
        }))}
        onClose={() => {
          setError(null)
          setLinkingSession(false)
        }}
      />
    </View>
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
