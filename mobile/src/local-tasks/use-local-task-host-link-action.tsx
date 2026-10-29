import { useState } from 'react'
import { ClipboardList } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskLinkToTaskSheet } from './local-task-link-to-task-sheet'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'

/**
 * The host screen's long-press "Link to task…", mounted by `host-screen-overlays.tsx`. Offered only
 * by a connected desktop that advertised `local-tasks.v1`, and never on a folder workspace (which
 * the host list does not long-press; it is linked from the task instead).
 */
export function useLocalTaskHostLinkAction(args: {
  client: RpcClient | null
  connState: ConnectionState
  hostCapabilities: readonly string[]
}) {
  const [target, setTarget] = useState<{
    candidate: LocalTaskWorkspaceCandidate
    hostLabel: string
  } | null>(null)
  const enabled = args.connState === 'connected' && hostAdvertisesLocalTasks(args.hostCapabilities)
  return {
    actionsFor(row: Worktree | null, done: () => void): ActionSheetAction[] {
      const candidate = row ? readLocalTaskWorkspaceCandidates([row])[0] : undefined
      if (!enabled || !row || !candidate || row.workspaceKind === 'folder-workspace') {
        return []
      }
      return [
        {
          label: localTasksCopy().work.linkToTask,
          icon: ClipboardList,
          closeBeforePress: true,
          onPress: () => {
            done()
            setTarget({ candidate, hostLabel: row.hostContextLabel ?? '' })
          }
        }
      ]
    },
    sheet: (
      <LocalTaskLinkToTaskSheet
        target={target?.candidate ?? null}
        hostLabel={target?.hostLabel ?? ''}
        client={args.client}
        onClose={() => setTarget(null)}
      />
    )
  }
}
