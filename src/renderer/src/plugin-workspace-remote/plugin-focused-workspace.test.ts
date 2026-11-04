// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { handlePluginViewRequest } from '../components/plugins/view/plugin-view-request-handler'

const initialState = useAppStore.getState()

afterEach(() => {
  useAppStore.setState(initialState, true)
})

function focus(activeWorktreeId: string | null): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the reader uses only these worktree and repo fields.
  useAppStore.setState({
    activeWorktreeId,
    worktreesByRepo: {
      'repo-1': [
        {
          id: 'repo-1::/home/dev/app',
          repoId: 'repo-1',
          path: '/home/dev/app',
          branch: 'refs/heads/main',
          displayName: 'app',
          runtimeOwnerEnvironmentId: 'env-ssh'
        }
      ]
    },
    repos: [
      {
        id: 'repo-1',
        gitRemoteIdentity: {
          canonicalKey: 'code.example.test/team/app',
          remoteName: 'origin',
          remoteUrl: 'https://bot:secret@code.example.test/team/app.git'
        }
      }
    ]
  } as unknown as Partial<ReturnType<typeof useAppStore.getState>>)
}

describe('read-focused-workspace', () => {
  it('answers with the focused worktree and its repository remote, without credentials', async () => {
    focus('repo-1::/home/dev/app')
    await expect(
      handlePluginViewRequest({ requestId: 'r', kind: 'read-focused-workspace' })
    ).resolves.toEqual({
      requestId: 'r',
      ok: true,
      workspace: {
        worktreeId: 'repo-1::/home/dev/app',
        branch: 'refs/heads/main',
        displayName: 'app',
        remote: { name: 'origin', url: 'https://code.example.test/team/app.git' }
      }
    })
  })

  it.each([
    ['nothing is focused', null],
    ['a folder workspace is focused', 'folder:f1']
  ])('answers null when %s', async (_name, activeWorktreeId) => {
    focus(activeWorktreeId)
    await expect(
      handlePluginViewRequest({ requestId: 'r', kind: 'read-focused-workspace' })
    ).resolves.toEqual({ requestId: 'r', ok: true, workspace: null })
  })
})
