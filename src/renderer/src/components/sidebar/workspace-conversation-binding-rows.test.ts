import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '../../../../shared/issues/types'
import { conversationMatchesWorkspace } from './workspace-conversation-binding-rows'

describe('Workspace Conversation binding rows', () => {
  it('matches both legacy and scoped worktree keys', () => {
    const item = conversation({ type: 'worktree', worktreeId: 'worktree-1' })

    expect(conversationMatchesWorkspace(item, 'worktree-1')).toBe(true)
    expect(conversationMatchesWorkspace(item, 'worktree:worktree-1')).toBe(true)
    expect(conversationMatchesWorkspace(item, 'worktree:worktree-2')).toBe(false)
  })

  it('matches folder workspaces only through the folder scope key', () => {
    const item = conversation({ type: 'folder', folderWorkspaceId: 'folder-1' })

    expect(conversationMatchesWorkspace(item, 'folder:folder-1')).toBe(true)
    expect(conversationMatchesWorkspace(item, 'folder:folder-2')).toBe(false)
    expect(conversationMatchesWorkspace(item, 'folder-1')).toBe(false)
  })
})

function conversation(workspaceRef: ConversationSummary['workspaceRef']): ConversationSummary {
  return { workspaceRef } as ConversationSummary
}
