import { describe, expect, it } from 'vitest'
import {
  PLUGIN_WORKSPACE_REMOTE_URL_MAX_LENGTH,
  projectPluginFocusedWorkspace,
  projectPluginWorkspaceRemote,
  withPluginWorkspaceRemote
} from './plugin-workspace-remote'

describe('plugin workspace remote', () => {
  it.each([
    [
      'https://user:secret@code.example.test/team/repo.git',
      'https://code.example.test/team/repo.git'
    ],
    ['https://ghp_token@github.com/acme/app.git', 'https://github.com/acme/app.git'],
    ['ssh://git:secret@code.example.test/team/repo.git', 'ssh://code.example.test/team/repo.git'],
    ['git@code.example.test:team/repo.git', 'git@code.example.test:team/repo.git'],
    [
      'ssh://git@code.example.test:2222/team/repo.git',
      'ssh://git@code.example.test:2222/team/repo.git'
    ]
  ])('hands plugins %s as %s', (remoteUrl, url) => {
    expect(projectPluginWorkspaceRemote({ remoteName: 'origin', remoteUrl })).toEqual({
      name: 'origin',
      url
    })
  })

  it.each([
    ['no recorded remote', null],
    ['an empty name', { remoteName: ' ', remoteUrl: 'git@host:team/repo.git' }],
    ['an empty URL', { remoteName: 'origin', remoteUrl: '' }],
    [
      'a URL past the published limit',
      {
        remoteName: 'origin',
        remoteUrl: `https://host/${'a'.repeat(PLUGIN_WORKSPACE_REMOTE_URL_MAX_LENGTH)}`
      }
    ]
  ])('leaves the field out for %s', (_name, identity) => {
    expect(projectPluginWorkspaceRemote(identity)).toBeUndefined()
  })

  it('reads the focused worktree remote from its own repository only', () => {
    const repos = [
      {
        id: 'other',
        gitRemoteIdentity: { remoteName: 'origin', remoteUrl: 'git@host:o/other.git' }
      },
      {
        id: 'repo-1',
        gitRemoteIdentity: { remoteName: 'upstream', remoteUrl: 'git@host:o/app.git' }
      }
    ]
    const context = { worktreeId: 'repo-1::/srv/app', branch: 'main', displayName: 'app' }
    expect(withPluginWorkspaceRemote(context, repos)).toEqual({
      ...context,
      remote: { name: 'upstream', url: 'git@host:o/app.git' }
    })
    expect(withPluginWorkspaceRemote({ ...context, worktreeId: 'missing::/x' }, repos)).toEqual({
      ...context,
      worktreeId: 'missing::/x'
    })
    expect(withPluginWorkspaceRemote(null, repos)).toBeNull()
  })

  it('describes the window focused worktree with its own repository remote, without credentials', () => {
    const worktree = {
      id: 'repo-1::/home/dev/app',
      repoId: 'repo-1',
      branch: 'refs/heads/main',
      displayName: 'app'
    }
    const repos = [
      {
        id: 'repo-1',
        gitRemoteIdentity: {
          remoteName: 'origin',
          remoteUrl: 'https://bot:secret@code.example.test/team/app.git'
        }
      }
    ]
    expect(projectPluginFocusedWorkspace(worktree, repos)).toEqual({
      worktreeId: 'repo-1::/home/dev/app',
      branch: 'refs/heads/main',
      displayName: 'app',
      remote: { name: 'origin', url: 'https://code.example.test/team/app.git' }
    })
    expect(projectPluginFocusedWorkspace(worktree, [])).toEqual({
      worktreeId: 'repo-1::/home/dev/app',
      branch: 'refs/heads/main',
      displayName: 'app'
    })
    expect(projectPluginFocusedWorkspace(undefined, repos)).toBeNull()
  })
})
