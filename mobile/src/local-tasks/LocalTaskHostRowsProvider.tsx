import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HostScreenController } from '../host-screen/use-host-screen-controller'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { scopeRpcClientToExecutionHost } from '../transport/execution-host-scoped-rpc-client'
import type { RpcClient } from '../transport/rpc-client'
import { useReachableServerClients } from '../worktree/use-reachable-server-clients'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import {
  localTaskEndpointFor,
  SELF_LOCAL_TASK_ENDPOINT,
  type LocalTaskEndpoint
} from './local-task-endpoint'
import {
  createLocalTaskHostLibraries,
  LocalTaskHostRowsContext,
  type LocalTaskHostLibraries
} from './local-task-host-rows'
import {
  localTaskCardTaskShown,
  useLocalTaskLibraryHoldsTasks
} from './local-task-library-presence'
import { useLocalTaskSessionLibrary } from './local-task-session-library'

type HostController = Pick<
  HostScreenController,
  'hostId' | 'client' | 'connState' | 'hostCapabilities'
> & {
  actions: Pick<HostScreenController['actions'], 'navigateFromHostList'>
  state: Pick<HostScreenController['state'], 'setActionTarget'>
}

/**
 * What the host list knows of the task libraries its rows belong to (D-008): the paired host's own,
 * for its machine, SSH targets and folders, and that of each server it relays to. Feeds the rows'
 * task icon and the long-press sheet's task row; mounted by `host-screen-view.tsx` around the list
 * and its overlays. A library is followed through the watch the session strip shares, and only
 * while it has a project; hiding local tasks keeps it followed, so links already made keep showing
 * (REQ-008). Out of contact the last read stays, marked not live, and nothing is asked until
 * contact comes back; a server is asked only through a paired host that has local tasks itself.
 */
export function LocalTaskHostRowsProvider(props: {
  controller: HostController
  children: ReactNode
}) {
  const { hostId, client, connState, hostCapabilities } = props.controller
  const [libraries] = useState(createLocalTaskHostLibraries)
  const latest = useRef(props.controller)
  useEffect(() => {
    latest.current = props.controller
  })
  const desktop = hostAdvertisesLocalTasks(hostCapabilities) ? client : null
  const connected = connState === 'connected'
  const { servers } = useReachableServerClients(desktop, hostCapabilities)
  const value = useMemo(
    () => ({
      hostId,
      libraries,
      open: (href: string) => {
        latest.current.state.setActionTarget(null)
        latest.current.actions.navigateFromHostList(href)
      }
    }),
    [hostId, libraries]
  )
  return (
    <LocalTaskHostRowsContext.Provider value={value}>
      {props.children}
      {desktop && hostId ? (
        <>
          <LibraryWatch
            libraries={libraries}
            hostId={hostId}
            endpoint={SELF_LOCAL_TASK_ENDPOINT}
            client={desktop}
            reachable={connected}
          />
          {(servers ?? []).map((server) => (
            <ServerLibraryWatch
              key={server.hostId}
              libraries={libraries}
              hostId={hostId}
              serverHost={server.hostId}
              client={scopeRpcClientToExecutionHost(desktop, server.hostId)}
              reachable={connected && server.relay === 'ready'}
            />
          ))}
        </>
      ) : null}
    </LocalTaskHostRowsContext.Provider>
  )
}

type WatchProps = {
  libraries: LocalTaskHostLibraries
  hostId: string
  client: RpcClient
  reachable: boolean
}

/** One library's links and tasks, published under its endpoint key while it has a project. */
function LibraryWatch(props: WatchProps & { endpoint: LocalTaskEndpoint }) {
  const { libraries, hostId, endpoint, client, reachable } = props
  const held = useLocalTaskLibraryHoldsTasks(client, reachable) === true
  // The session strip's key, so a session screen open on this library shares its reads.
  const watched = useLocalTaskSessionLibrary(
    held ? `${hostId}\u0000${endpoint.key}` : null,
    client,
    reachable
  )
  const links = watched.data?.links ?? null
  const tasks = watched.data?.tasks ?? null
  const live = reachable && watched.fresh
  // Read after the presence check above, which re-renders once the status it reads arrives.
  const glyphShown = localTaskCardTaskShown(client)
  const library = useMemo(
    () => (held && links && tasks ? { links, tasks, live, glyphShown } : null),
    [held, links, tasks, live, glyphShown]
  )
  useEffect(() => {
    libraries.set(endpoint.key, library)
    return () => libraries.set(endpoint.key, null)
  }, [libraries, endpoint.key, library])
  return null
}

/** A server's library, once the server says it has local tasks; an older one is never asked. */
function ServerLibraryWatch(props: WatchProps & { serverHost: `runtime:${string}` }) {
  const { serverHost, client, reachable } = props
  const [probe, setProbe] = useState<{ client: RpcClient; advertises: boolean } | null>(null)
  useEffect(() => {
    if (!reachable) {
      return
    }
    let current = true
    taskRuntimeStatusRead.requestSingleFlight(client, serverHost).then(
      (reply) => {
        if (current) {
          setProbe({
            client,
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
  }, [client, serverHost, reachable])
  const endpoint = useMemo(() => localTaskEndpointFor(serverHost), [serverHost])
  if (probe?.client !== client || !probe.advertises) {
    return null
  }
  return <LibraryWatch {...props} endpoint={endpoint} />
}
