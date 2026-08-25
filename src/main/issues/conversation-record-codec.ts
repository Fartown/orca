import type { TuiAgent } from '../../shared/tui-agent'
import type { ConversationRecord } from '../../shared/issues/types'

export type ConversationRow = {
  id: string
  host_partition_key: ConversationRecord['hostPartitionKey']
  execution_host_id: ConversationRecord['executionHostId']
  workspace_kind: 'worktree' | 'folder'
  workspace_id: string
  workspace_name_snapshot: string
  workspace_path_snapshot: string
  agent: string
  title: string | null
  issue_id: string | null
  record_revision: number
  launch_failure_message: string | null
  launch_failed_at: number | null
  created_at: number
  updated_at: number
}

export function conversationRecordFromRow(row: ConversationRow): ConversationRecord {
  const workspaceRef =
    row.workspace_kind === 'worktree'
      ? { type: 'worktree' as const, worktreeId: row.workspace_id }
      : { type: 'folder' as const, folderWorkspaceId: row.workspace_id }
  return {
    id: row.id,
    hostPartitionKey: row.host_partition_key,
    executionHostId: row.execution_host_id,
    workspaceRef,
    workspaceSnapshot: {
      name: row.workspace_name_snapshot,
      path: row.workspace_path_snapshot
    },
    agent: row.agent as TuiAgent,
    title: row.title,
    issueId: row.issue_id,
    recordRevision: row.record_revision,
    launchFailure:
      row.launch_failure_message === null || row.launch_failed_at === null
        ? null
        : { message: row.launch_failure_message, failedAt: row.launch_failed_at },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
