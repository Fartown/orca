import type { ReactNode } from 'react'
import {
  HostStatusGatesContext,
  useOptionalHostProtocolGates
} from '../components/host-connection/host-protocol-gates-context'
import { WorkspaceExecutionHostContext } from '../navigation/workspace-execution-host'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { WorkspaceServerContext } from '../worktree/execution-hosts/workspace-server-context'
import { useWorkspaceServer } from '../worktree/execution-hosts/workspace-server'

const NO_CAPABILITIES: readonly string[] = []

/**
 * What the session page's route gives its screens, for a server's workspace shown in place: calls,
 * gates and pushes run on the server, as `WorkspaceRoute` routes them. An unreachable server reads
 * as such; the paired desktop never stands in for it.
 */
export function LocalTaskServerWorkspaceScope(props: {
  hostId: string
  executionHost: `runtime:${string}`
  children: ReactNode
}) {
  const { client, state } = useHostClient(props.hostId)
  const desktopGates = useOptionalHostProtocolGates()
  const { server } = useWorkspaceServer({
    client,
    connState: state,
    desktopCapabilities: desktopGates?.hostCapabilities ?? NO_CAPABILITIES,
    executionHost: props.executionHost
  })
  const screens = (
    <WorkspaceExecutionHostContext.Provider value={props.executionHost}>
      {props.children}
    </WorkspaceExecutionHostContext.Provider>
  )
  return server ? (
    <WorkspaceServerContext.Provider value={server}>
      <HostStatusGatesContext.Provider value={server.gates}>
        {screens}
      </HostStatusGatesContext.Provider>
    </WorkspaceServerContext.Provider>
  ) : (
    screens
  )
}
