import { existsSync } from 'node:fs'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'
import type { WorkspaceScope } from '../../shared/folder-workspace-types'
import { getIssueDatabasePath } from './issue-database'
import SyncDatabase from '../sqlite/sync-database'

export type ManagedProjectConversation = {
  conversationId: string
  workspaceRef: WorkspaceScope
  title: string | null
}

export type IssueProjectMoveGuard = {
  findManagedConversationsForRepo(input: {
    profileId: string
    repoId: string
  }): ManagedProjectConversation[]
}

export class ProfileIssueProjectMoveGuard implements IssueProjectMoveGuard {
  constructor(private readonly userDataPath: string) {}

  findManagedConversationsForRepo(input: {
    profileId: string
    repoId: string
  }): ManagedProjectConversation[] {
    const databasePath = getIssueDatabasePath(input.profileId, this.userDataPath)
    if (!existsSync(databasePath)) {
      return []
    }
    const database = new SyncDatabase(databasePath, { readonly: true, fileMustExist: true })
    try {
      database.pragma('foreign_keys = ON')
      if (Number(database.pragma('foreign_keys', { simple: true })) !== 1) {
        throw new Error('issue_project_move_guard_foreign_keys_unavailable')
      }
      const rows = database
        .prepare(
          `SELECT id, workspace_id, title FROM conversations
           WHERE workspace_kind = 'worktree'`
        )
        .all() as { id: string; workspace_id: string; title: string | null }[]
      return rows
        .filter((row) => getRepoIdFromWorktreeId(row.workspace_id) === input.repoId)
        .map((row) => ({
          conversationId: row.id,
          workspaceRef: { type: 'worktree', worktreeId: row.workspace_id },
          title: row.title
        }))
    } finally {
      database.close()
    }
  }
}
