import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REMOTE_ARTIFACT_INPUT_ENV, sshArtifactSourceKey } from '../../shared/artifact-cli-bridge'
import { toSshExecutionHostId } from '../../shared/execution-host'
import {
  ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV
} from '../../shared/orchestration-compatibility-evidence'
import { RuntimeClientError } from '../runtime-client'
import {
  resolveArtifactShareCliFileTarget,
  resolveArtifactShareCliHost,
  tokenFromArtifactShareLinkOrToken
} from './artifact-share-cli-target'

const cwd = resolve('/work/octo/docs')
const workspace = resolve('/work/octo')

function sshInput(targetId: string, path: string): string {
  return JSON.stringify({ sourceKey: sshArtifactSourceKey(targetId, path), fileName: 'plan.md' })
}

describe('artifact share CLI file target', () => {
  it('shares a local file under the terminal workspace that holds it', () => {
    expect(
      resolveArtifactShareCliFileTarget(
        { ORCA_WORKTREE_ID: `repo-1::${workspace}` },
        cwd,
        'plan.md'
      )
    ).toEqual({
      executionHostId: 'local',
      workspaceRoot: workspace,
      sourcePath: resolve(cwd, 'plan.md')
    })
  })

  it('lets the owner scope files outside the terminal workspace', () => {
    expect(
      resolveArtifactShareCliFileTarget(
        { ORCA_WORKTREE_ID: `repo-1::${workspace}` },
        cwd,
        resolve('/tmp/other.md')
      )
    ).toEqual({ executionHostId: 'local', sourcePath: resolve('/tmp/other.md') })
    // A sibling whose name only starts with the workspace name is not inside it.
    expect(
      resolveArtifactShareCliFileTarget(
        { ORCA_WORKTREE_ID: `repo-1::${workspace}` },
        cwd,
        resolve('/work/octo-old/a.md')
      ).workspaceRoot
    ).toBeUndefined()
  })

  it('reads folder workspaces from their scoped id or root', () => {
    expect(
      resolveArtifactShareCliFileTarget(
        {
          ORCA_WORKSPACE_ID: `worktree:repo-1::${workspace}::workspace:b1706d92-9d05-4932-8360-01e00b54305a`
        },
        cwd,
        'plan.md'
      ).workspaceRoot
    ).toBe(workspace)
    expect(
      resolveArtifactShareCliFileTarget(
        { ORCA_WORKSPACE_ID: 'folder:abc', ORCA_WORKSPACE_ROOT: workspace },
        cwd,
        'plan.md'
      ).workspaceRoot
    ).toBe(workspace)
  })

  it('forwards the SSH host path so that host serves the file', () => {
    expect(
      resolveArtifactShareCliFileTarget(
        {
          [REMOTE_ARTIFACT_INPUT_ENV]: sshInput('minizc', '/Users/me/octo/docs/plan.md'),
          ORCA_WORKTREE_ID: 'repo-2::/Users/me/octo',
          // Not forwarded by the SSH bridge, so a value here belongs to this app.
          ORCA_WORKSPACE_ROOT: '/Users/me'
        },
        cwd,
        'ignored.md'
      )
    ).toEqual({
      executionHostId: toSshExecutionHostId('minizc'),
      workspaceRoot: '/Users/me/octo',
      sourcePath: '/Users/me/octo/docs/plan.md'
    })
    expect(
      resolveArtifactShareCliFileTarget(
        {
          [REMOTE_ARTIFACT_INPUT_ENV]: sshInput('minizc', '/Users/me/octo/docs/plan.md'),
          ORCA_WORKSPACE_ROOT: '/Users/me'
        },
        cwd,
        undefined
      ).workspaceRoot
    ).toBeUndefined()
  })

  it('requires a file when the command runs locally', () => {
    expect(() => resolveArtifactShareCliFileTarget({}, cwd, undefined)).toThrow(RuntimeClientError)
  })
})

describe('artifact share CLI host', () => {
  it('answers for the SSH host a remote terminal runs on', () => {
    expect(
      resolveArtifactShareCliHost({
        [ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV]: 'ssh',
        [ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV]: 'minizc'
      })
    ).toBe(toSshExecutionHostId('minizc'))
    expect(resolveArtifactShareCliHost({})).toBe('local')
  })

  it('takes a token from a link or a bare token', () => {
    expect(
      tokenFromArtifactShareLinkOrToken(
        'http://192.168.1.20:18787/AbCdEfGhIjKlMnOpQrStUv/docs/plan.md'
      )
    ).toBe('AbCdEfGhIjKlMnOpQrStUv')
    expect(tokenFromArtifactShareLinkOrToken(' AbCdEfGhIjKlMnOpQrStUv ')).toBe(
      'AbCdEfGhIjKlMnOpQrStUv'
    )
  })
})
