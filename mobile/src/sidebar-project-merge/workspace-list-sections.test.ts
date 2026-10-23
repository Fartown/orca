import { describe, expect, it } from 'vitest'
import { NO_WORKSPACE_ROW_FILTERS } from '../../../../src/shared/workspace-view/workspace-row-filters'
import {
  NO_PROJECT_SECTION_CATALOG,
  buildSections,
  sortWorktrees,
  type Worktree
} from '../worktree/workspace-list-sections'

describe('same-name project sections', () => {
  it('groups three host directories and separates a renamed one without changing native IDs', () => {
    const ids = ['local', 'mini', 'dbox']
    const rows: Worktree[] = ids.map((id) => ({
      repoId: id,
      worktreeId: `${id}::/workspace`,
      repo: 'workspace',
      workspaceKind: 'folder',
      hostId: id === 'local' ? 'local' : `ssh:${id}`,
      branch: 'main',
      displayName: 'workspace',
      path: `/repos/${id}`,
      liveTerminalCount: 0,
      hasAttachedPty: false,
      unread: false,
      isPinned: false,
      linkedPR: null,
      status: 'inactive',
      agents: []
    }))
    const nativeCatalog = {
      ...NO_PROJECT_SECTION_CATALOG,
      repos: ids.map((id) => ({ id, displayName: 'workspace', path: `/repos/${id}` })),
      grouping: {
        projects: ids.map((id) => ({ id: `repo:${id}`, displayName: 'workspace' })),
        projectHostSetups: ids.map((id) => ({
          id,
          repoId: id,
          projectId: `repo:${id}`,
          hostId: 'local' as const,
          path: `/repos/${id}`,
          displayName: 'workspace',
          setupMethod: 'legacy-repo' as const,
          kind: 'folder' as const
        }))
      }
    }
    const before = JSON.stringify({ rows, nativeCatalog })
    const merged = buildSections(
      rows,
      'manual',
      { ...NO_WORKSPACE_ROW_FILTERS },
      '',
      'repo',
      new Set(),
      nativeCatalog
    )
    expect(merged.map(({ key }) => key)).toEqual(['sidebar-name:workspace'])
    expect(merged[0].data.map(({ worktreeId }) => worktreeId)).toEqual(
      sortWorktrees(rows, 'manual').map(({ worktreeId }) => worktreeId)
    )
    const renamed = {
      ...nativeCatalog,
      repos: nativeCatalog.repos.map((repo) =>
        repo.id === 'dbox' ? { ...repo, displayName: 'workspace-dbox' } : repo
      ),
      grouping: {
        ...nativeCatalog.grouping,
        projects: nativeCatalog.grouping.projects.map((project) =>
          project.id === 'repo:dbox' ? { ...project, displayName: 'workspace-dbox' } : project
        )
      }
    }
    const separate = buildSections(
      rows,
      'manual',
      { ...NO_WORKSPACE_ROW_FILTERS },
      '',
      'repo',
      new Set(),
      renamed
    )
    expect(separate.map(({ key }) => key)).toEqual(['sidebar-name:workspace', 'project:repo:dbox'])
    expect(JSON.stringify({ rows, nativeCatalog })).toBe(before)
  })
})
