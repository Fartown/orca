import { useEffect, useState } from 'react'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskEffectiveWorkspace } from '../../../src/shared/local-tasks/local-task-tree'
import { makePaneKey } from '../../../src/shared/stable-pane-id'
import { worktreeIdsEqual } from '../../../src/shared/worktree/id'
import { useOptionalHostProtocolGates } from '../components/host-protocol-gates-context'
import type { MobileSessionTab } from '../session/mobile-session-route-types'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { useHostClient } from '../transport/host-client-hooks'
import { useWorkspaceClient } from '../transport/use-workspace-client'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import type { LocalTaskEndpoint } from './local-task-endpoint'
import { useLocalTaskSessionLibrary } from './local-task-session-library'
import { localTaskWorkspaceRouteId } from './local-task-work-navigation'

/** A pane key from listed ids, or null when the leaf is not one this build can key. */
export function safePaneKey(tabId: string, leafId: string): string | null {
  try {
    return makePaneKey(tabId, leafId)
  } catch {
    return null
  }
}

/**
 * Which linked session the open tab is. The library holds its host's own ids, and the phone's route
 * into that host lists the same ones, so they compare as they are.
 */
export function localTaskSessionForTab(
  sessions: readonly LocalTaskSessionLink[],
  tab: MobileSessionTab | null
): LocalTaskSessionLink | null {
  if (tab?.type === 'agent-session') {
    return sessions.find((link) => link.sessionId === tab.sessionId) ?? null
  }
  if (tab?.type !== 'terminal') {
    return null
  }
  const tabId = tab.parentTabId ?? tab.id
  const paneKey = tab.leafId ? safePaneKey(tabId, tab.leafId) : null
  return (
    sessions.find(
      (link) =>
        (paneKey !== null && link.paneKey === paneKey) ||
        // Why only an unclaimed link by tab: a claimed one names its own pane.
        (link.paneKey === null && link.tabId === tabId)
    ) ?? null
  )
}

/** The task link of the workspace this session screen shows, by its route id. */
export function localTaskWorkspaceForRoute(
  workspaces: readonly LocalTaskWorkspaceLink[],
  worktreeId: string
): LocalTaskWorkspaceLink | null {
  return (
    workspaces.find((link) => {
      const routeId = localTaskWorkspaceRouteId(link)
      return routeId !== null && (routeId === worktreeId || worktreeIdsEqual(routeId, worktreeId))
    }) ?? null
  )
}

type StripData = {
  links: LocalTaskLinks
  tasks: LocalTask[]
  /** Null when it could not be read; the strip still names the task. */
  progress: LocalTaskProgressSnapshot | null
}

/**
 * The task a session screen names — its open session's, else its workspace's — with that
 * workspace's link and, for linking a session, the workspace's task and every task below it that
 * works in this same workspace (REQ-011). Null when neither is linked.
 */
export function localTaskStripLine(
  data: StripData,
  worktreeId: string,
  openSession: LocalTaskSessionLink | null
) {
  const workspace = localTaskWorkspaceForRoute(data.links.workspaces, worktreeId)
  const taskId = openSession?.taskId ?? workspace?.taskId
  const task = data.tasks.find((entry) => entry.id === taskId)
  if (!task) {
    return null
  }
  const tasksById = new Map(data.tasks.map((entry) => [entry.id, entry]))
  const workspacesByTaskId = new Map(data.links.workspaces.map((link) => [link.taskId, link]))
  const sessionChoices = workspace
    ? data.tasks
        .filter(
          (entry) => localTaskEffectiveWorkspace(entry, tasksById, workspacesByTaskId) === workspace
        )
        .sort((a, b) => a.number - b.number)
    : []
  return { task, workspace, sessionChoices }
}

/**
 * For a server's workspace, whether the paired host relaying to it has local tasks itself, so an
 * older one is never sent a relayed task call; true for the paired host's own workspaces.
 */
function useRelayingHostHasLocalTasks(hostId: string | undefined, viaServer: boolean): boolean {
  const desktop = useHostClient(hostId)
  const [probe, setProbe] = useState<{ client: unknown; advertises: boolean } | null>(null)
  useEffect(() => {
    if (!viaServer || desktop.state !== 'connected' || !desktop.client || !hostId) {
      return
    }
    const probed = desktop.client
    let current = true
    taskRuntimeStatusRead.requestSingleFlight(probed, hostId).then(
      (reply) => {
        if (current) {
          setProbe({
            client: probed,
            advertises: hostAdvertisesLocalTasks(
              taskRuntimeStatusRead.interpret(reply).capabilities
            )
          })
        }
      },
      () => {}
    )
    return () => {
      current = false
    }
  }, [viaServer, desktop.client, desktop.state, hostId])
  return !viaServer || (probe?.client === desktop.client && probe.advertises)
}

/**
 * What the session header's task strip reads: links, tasks and "Needs you" from the library of the Orca the
 * workspace runs on (D-008), the paired host's or a server's, through the route's own client and
 * gates. A server's library is read only through a paired host that has local tasks itself, so an
 * older one never answers a relayed task call from its own library. Every session screen of a
 * library shares one watch of it (`local-task-session-library.ts`); nothing is read on a timer.
 *
 * The line outlives contact: out of contact it is the last read, with `live` false.
 */
export function useLocalTaskSessionStrip(
  hostId: string | undefined,
  endpoint: LocalTaskEndpoint,
  route: { worktreeId: string; activeSessionTab: MobileSessionTab | null }
) {
  const { client, state } = useWorkspaceClient(hostId)
  const gates = useOptionalHostProtocolGates()
  const relayingHostHasTasks = useRelayingHostHasLocalTasks(
    hostId,
    endpoint.executionHost !== undefined
  )
  const connected = state === 'connected' && client !== null
  const advertised = hostAdvertisesLocalTasks(gates?.hostCapabilities) && relayingHostHasTasks
  const library = useLocalTaskSessionLibrary(
    hostId ? `${hostId}\u0000${endpoint.key}` : null,
    advertised ? client : null,
    connected
  )
  const shown = library.data
  const data: StripData | null =
    shown?.links && shown.tasks
      ? { links: shown.links, tasks: shown.tasks, progress: shown.progress }
      : null
  const live = connected && advertised && library.fresh && data !== null
  const openSession = data
    ? localTaskSessionForTab(data.links.sessions, route.activeSessionTab)
    : null
  return {
    client,
    /** In contact and following the library, so what the line says is current. */
    live,
    openSession,
    /** What the strip names, or null when neither the session nor its workspace is linked. */
    line: data ? localTaskStripLine(data, route.worktreeId, openSession) : null,
    /** Only a current snapshot, which is what may mark items seen. */
    liveProgress: live ? (data?.progress ?? null) : null,
    reload: library.reload
  }
}
