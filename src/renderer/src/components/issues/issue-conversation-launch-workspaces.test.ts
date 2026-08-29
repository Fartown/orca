import { describe, expect, it } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { collectIssueConversationLaunchWorkspaces } from './issue-conversation-launch-workspaces'

describe('Issue Conversation launch Workspace options', () => {
  it('reuses inherited ProjectGroup ownership for SSH folder Workspaces', () => {
    const result = collectIssueConversationLaunchWorkspaces({
      repos: [],
      worktreesByRepo: {},
      folderWorkspaces: [folderWorkspace()],
      projectGroups: [projectGroup({ connectionId: 'ssh-builder' })],
      route: 'ssh:ssh-builder'
    })

    expect(result).toEqual([
      {
        id: 'folder:folder-1',
        label: 'Remote Folder',
        path: '/workspace/remote',
        ref: { type: 'folder', folderWorkspaceId: 'folder-1' }
      }
    ])
  })

  it('keeps a runtime-owned Folder on its stamped runtime route', () => {
    const result = collectIssueConversationLaunchWorkspaces({
      repos: [],
      worktreesByRepo: {},
      folderWorkspaces: [folderWorkspace({ executionHostId: 'runtime:paired' })],
      projectGroups: [projectGroup({ connectionId: 'ssh-builder' })],
      route: 'runtime:paired'
    })

    expect(result).toHaveLength(1)
  })
})

function folderWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-1',
    projectGroupId: 'group-1',
    name: 'Remote Folder',
    folderPath: '/workspace/remote',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 1,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function projectGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Remote Project',
    parentPath: '/workspace',
    parentGroupId: null,
    createdFrom: 'folder-scan',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}
