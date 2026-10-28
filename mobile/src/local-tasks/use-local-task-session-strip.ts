import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { makePaneKey } from '../../../src/shared/stable-pane-id'
import { worktreeIdsEqual } from '../../../src/shared/worktree/id'
import { useOptionalHostProtocolGates } from '../components/host-protocol-gates-context'
import type { MobileSessionTab } from '../session/mobile-session-route-types'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { useHostClient } from '../transport/host-client-hooks'
import { useWorkspaceClient } from '../transport/use-workspace-client'
import { createLocalTasksApi } from './local-tasks-api'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { startLocalTasksChangeFeed } from './local-tasks-change-feed'
import type { LocalTaskEndpoint } from './local-task-endpoint'
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
 * What the session header's task strip reads: links, tasks and "Needs you" from the library of the Orca the
 * workspace runs on (D-008), the paired host's or a server's, through the route's own client and
 * gates. A server's library is read only through a paired host that has local tasks itself, so an
 * older one never answers a relayed task call from its own library. Re-read on the change feed and
 * on coming back to the foreground; nothing is read on a timer.
 */
export function useLocalTaskSessionStrip(hostId: string | undefined, endpoint: LocalTaskEndpoint) {
  const desktop = useHostClient(hostId)
  const { client, state } = useWorkspaceClient(hostId)
  const gates = useOptionalHostProtocolGates()
  const [desktopProbe, setDesktopProbe] = useState<{ client: unknown; advertises: boolean } | null>(
    null
  )
  const [data, setData] = useState<StripData | null>(null)
  const connected = state === 'connected' && client !== null
  const viaServer = endpoint.executionHost !== undefined
  const desktopAdvertises =
    !viaServer || (desktopProbe?.client === desktop.client && desktopProbe.advertises)
  const advertised = hostAdvertisesLocalTasks(gates?.hostCapabilities) && desktopAdvertises
  const sequence = useRef(0)

  useEffect(() => {
    if (!viaServer || desktop.state !== 'connected' || !desktop.client || !hostId) {
      return
    }
    const probed = desktop.client
    let current = true
    taskRuntimeStatusRead.requestSingleFlight(probed, hostId).then(
      (reply) => {
        if (current) {
          setDesktopProbe({
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

  const reload = useCallback(() => {
    if (!client || !connected || !advertised) {
      return
    }
    const turn = ++sequence.current
    const api = createLocalTasksApi(client)
    Promise.all([api.links(), api.tasks(), api.progress().catch(() => null)]).then(
      ([links, tasks, progress]) => {
        if (turn === sequence.current) {
          setData({ links, tasks, progress })
        }
      },
      () => {}
    )
  }, [client, connected, advertised])

  useEffect(() => {
    if (!client || !connected || !advertised) {
      return
    }
    return startLocalTasksChangeFeed({
      client,
      appState: AppState,
      onFullReload: reload,
      onScopes: (scopes) => {
        if (scopes.includes('links') || scopes.includes('tasks') || scopes.includes('attention')) {
          reload()
        }
      }
    })
  }, [client, connected, advertised, reload])

  return {
    client,
    desktopClient: desktop.client,
    advertised: connected && advertised,
    data,
    reload
  }
}
