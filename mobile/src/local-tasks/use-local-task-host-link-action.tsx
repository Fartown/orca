import { useState } from 'react'
import { ClipboardList } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { useLocalTaskLibraryHasProjects } from './local-task-library-presence'
import { LocalTaskLinkToTaskSheet } from './local-task-link-to-task-sheet'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'

/** The server a row runs on, as the host list resolves it; its library is the one to link in. */
type RowServer = {
  client: RpcClient | null
  state: ConnectionState
  gates: { hostCapabilities: readonly string[] }
} | null

/** The client of the library a row belongs to: its server's when in contact and current enough. */
function owningLibrary(desktop: RpcClient | null, server: RowServer): RpcClient | null {
  if (!server) {
    return desktop
  }
  return server.state === 'connected' && hostAdvertisesLocalTasks(server.gates.hostCapabilities)
    ? server.client
    : null
}

function sameRow(a: Worktree | null, b: Worktree | null): boolean {
  return a !== null && b !== null && a.worktreeId === b.worktreeId && a.hostId === b.hostId
}

/**
 * The host screen's long-press "Link to task…", mounted by `host-screen-overlays.tsx` after
 * upstream's own items. Offered only when the library that owns the row has a task project: the
 * connected desktop's, or the row's server's when that server and the desktop both advertise
 * `local-tasks.v1`. Never on a folder workspace (which the host list does not long-press; it is
 * linked from the task instead). Asking costs one `localTasks.status` per sheet opening, until a
 * project is known to exist.
 */
export function useLocalTaskHostLinkAction(args: {
  client: RpcClient | null
  connState: ConnectionState
  hostCapabilities: readonly string[]
  /** The row the action sheet is open on. */
  target: Worktree | null
  server: RowServer
}) {
  const [linking, setLinking] = useState<{
    candidate: LocalTaskWorkspaceCandidate
    hostLabel: string
  } | null>(null)
  const candidate =
    args.target && args.target.workspaceKind !== 'folder-workspace'
      ? readLocalTaskWorkspaceCandidates([args.target])[0]
      : undefined
  const desktopHasTasks =
    args.connState === 'connected' && hostAdvertisesLocalTasks(args.hostCapabilities)
  const asked = desktopHasTasks && candidate ? owningLibrary(args.client, args.server) : null
  const hasProjects = useLocalTaskLibraryHasProjects(asked)
  return {
    actionsFor(row: Worktree | null, done: () => void): ActionSheetAction[] {
      if (
        !candidate ||
        asked === null ||
        hasProjects !== true ||
        !row ||
        !sameRow(row, args.target)
      ) {
        return []
      }
      return [
        {
          label: localTasksCopy().work.linkToTask,
          icon: ClipboardList,
          closeBeforePress: true,
          onPress: () => {
            done()
            setLinking({ candidate, hostLabel: row.hostContextLabel ?? '' })
          }
        }
      ]
    },
    sheet: (
      <LocalTaskLinkToTaskSheet
        target={linking?.candidate ?? null}
        hostLabel={linking?.hostLabel ?? ''}
        client={args.client}
        onClose={() => setLinking(null)}
      />
    )
  }
}
