import { describe, expect, it } from 'vitest'
import { toSshExecutionHostId } from '../../../../../shared/execution-host'
import type { EditorFileOperationProvenance } from '@/lib/editor-file-operation-owner'
import type { WorktreeOperationRoute } from '@/lib/worktree-operation-route'
import {
  deriveLanArtifactShareRoot,
  resolveDocPreviewShareTarget,
  resolveEditorFileShareTarget
} from './lan-artifact-share-target'

function provenance(route: WorktreeOperationRoute): EditorFileOperationProvenance {
  return {
    generation: {
      route,
      runtimeConnectionGeneration: null,
      runtimePairingRevision: undefined,
      runtimeSshGeneration: null,
      nestedSshGeneration: null,
      directSshGeneration: null
    },
    ownershipProjection: 'explicit'
  }
}

const state = {}

describe('lan artifact share root', () => {
  it('strips the workspace-relative path from the absolute path', () => {
    expect(deriveLanArtifactShareRoot('/Users/me/octo/docs/plan.md', 'docs/plan.md')).toBe(
      '/Users/me/octo'
    )
    expect(deriveLanArtifactShareRoot('C:\\work\\octo\\docs\\plan.md', 'docs/plan.md')).toBe(
      'C:\\work\\octo'
    )
    expect(deriveLanArtifactShareRoot('C:\\plan.md', 'plan.md')).toBe('C:\\')
  })

  it('returns null when the file is not under its relative path', () => {
    expect(deriveLanArtifactShareRoot('/Users/me/elsewhere/plan.md', 'docs/plan.md')).toBeNull()
    expect(deriveLanArtifactShareRoot('/plan.md', 'plan.md')).toBeNull()
    expect(deriveLanArtifactShareRoot('/Users/me/octo/plan.md', '')).toBeNull()
  })
})

describe('editor file share target', () => {
  const file = {
    filePath: '/Users/me/octo/docs/plan.md',
    relativePath: 'docs/plan.md',
    worktreeId: 'repo-1::/Users/me/octo',
    externalSshTargetId: undefined
  }

  it('asks the SSH host that owns the workspace', () => {
    expect(
      resolveEditorFileShareTarget(state, {
        ...file,
        operationProvenance: provenance({
          executionHostId: toSshExecutionHostId('minizc'),
          runtimeEnvironmentId: null
        })
      })
    ).toEqual({
      ok: true,
      target: {
        executionHostId: toSshExecutionHostId('minizc'),
        workspaceRoot: '/Users/me/octo',
        sourcePath: '/Users/me/octo/docs/plan.md'
      }
    })
  })

  it('leaves the scope to the SSH host for a file opened outside any workspace', () => {
    expect(resolveEditorFileShareTarget(state, { ...file, externalSshTargetId: 'minizc' })).toEqual(
      {
        ok: true,
        target: {
          executionHostId: toSshExecutionHostId('minizc'),
          sourcePath: '/Users/me/octo/docs/plan.md'
        }
      }
    )
  })

  it('routes a paired Orca workspace to that Orca, but not an SSH host behind it', () => {
    expect(
      resolveEditorFileShareTarget(state, {
        ...file,
        operationProvenance: provenance({ executionHostId: 'local', runtimeEnvironmentId: 'env 1' })
      })
    ).toMatchObject({ ok: true, target: { executionHostId: 'runtime:env%201' } })
    expect(
      resolveEditorFileShareTarget(state, {
        ...file,
        operationProvenance: provenance({
          executionHostId: toSshExecutionHostId('minizc'),
          runtimeEnvironmentId: 'env 1'
        })
      })
    ).toEqual({ ok: false, reason: 'nested-remote' })
  })

  it('refuses when no computer can be named for the file', () => {
    expect(
      resolveEditorFileShareTarget(state, {
        ...file,
        operationProvenance: provenance({ executionHostId: null, runtimeEnvironmentId: null })
      })
    ).toEqual({ ok: false, reason: 'unknown-host' })
  })
})

describe('document preview grant owner', () => {
  it('keeps the minted runtime and root instead of resolving the currently selected workspace', () => {
    const location = {
      owner: {
        kind: 'runtime' as const,
        environmentId: 'ssh/orcad-a',
        worktreeRoot: '/srv/repo',
        worktreeSelector: '/srv/repo'
      },
      requestBase: '/srv/repo',
      root: '/srv/repo/docs',
      entryRelativePath: 'docs/report.html'
    }
    expect(resolveDocPreviewShareTarget(location, '/srv/repo/docs/report.html')).toEqual({
      ok: true,
      target: {
        executionHostId: 'runtime:ssh%2Forcad-a',
        workspaceRoot: '/srv/repo',
        sourcePath: '/srv/repo/docs/report.html'
      }
    })
  })
  it('keeps a legacy SSH grant remote so an unsupported host never reads a local same-path file', () => {
    expect(
      resolveDocPreviewShareTarget(
        {
          owner: { kind: 'ssh', connectionId: 'old-host' },
          requestBase: '/srv/repo',
          root: '/srv/repo',
          entryRelativePath: 'report.html'
        },
        '/srv/repo/report.html'
      )
    ).toEqual({
      ok: true,
      target: {
        executionHostId: 'ssh:old-host',
        workspaceRoot: '/srv/repo',
        sourcePath: '/srv/repo/report.html'
      }
    })
  })
})
