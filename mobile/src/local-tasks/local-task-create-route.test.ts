import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'

const upstream = vi.hoisted(() => ({ blank: vi.fn(), sourced: vi.fn() }))
vi.mock('../new-workspace/creation/blank-workspace-create', () => ({
  createBlankWorkspace: upstream.blank
}))
vi.mock('../new-workspace/creation/source-workspace-create', () => ({
  createWorkspaceFromComposerSource: upstream.sourced
}))

const { createBlankWorkspace, createWorkspaceFromComposerSource, routeLocalTaskCreate } =
  await import('./local-task-create-route')

const client = {} as RpcClient
const created = { worktreeId: 'wt', name: 'n' }

function blankArgs(overrides: Partial<Parameters<typeof createBlankWorkspace>[0]> = {}) {
  return {
    client,
    repoId: 'repo',
    baseName: 'typed-name',
    nameWasGenerated: false,
    createdWithAgentId: 'codex',
    comment: 'note',
    setupDecision: 'run',
    worktreeCreateIdempotency: () => 'unknown',
    agentLaunchSupported: true,
    ...overrides
  } as Parameters<typeof createBlankWorkspace>[0]
}

describe('local task create route', () => {
  beforeEach(() => {
    upstream.blank.mockReset().mockResolvedValue(created)
    upstream.sourced.mockReset().mockResolvedValue(created)
  })

  it('creates through upstream while no task is the source', async () => {
    await createBlankWorkspace(blankArgs())
    expect(upstream.blank).toHaveBeenCalledOnce()
  })

  it('runs the task create with the sheet request while a task is the source', async () => {
    const run = vi.fn().mockResolvedValue(created)
    const release = routeLocalTaskCreate(client, run)
    await createBlankWorkspace(blankArgs({ nameWasGenerated: true }))
    await createWorkspaceFromComposerSource({
      client,
      workspaceName: undefined,
      agent: { choice: 'blank' },
      setupDecision: 'skip',
      note: undefined
    } as unknown as Parameters<typeof createWorkspaceFromComposerSource>[0])
    expect(upstream.blank).not.toHaveBeenCalled()
    expect(upstream.sourced).not.toHaveBeenCalled()
    expect(run.mock.calls).toEqual([
      [{ name: '', agent: 'codex', setupDecision: 'run', note: 'note' }],
      [{ name: '', agent: null, setupDecision: 'skip', note: undefined }]
    ])
    release()
    await createBlankWorkspace(blankArgs())
    expect(upstream.blank).toHaveBeenCalledOnce()
  })
})
