import { vi } from 'vitest'
import { RuntimeFileReads } from '../runtime/files/file-reads'
import type { RuntimeFileCommandHost } from '../runtime/files/file-command-host'
import {
  getConnectionExecutionHostId,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host/execution-host'

// Why: upstream retired its runtime file-command harness; these suites still need the real reads on a temp worktree.
export function createDocumentPreviewFileReads(options?: { path?: string; hostId?: string }) {
  const store = {
    getSettings: vi.fn(() => ({ followSymlinkedDirectories: false })),
    getRepo: vi.fn<(_repoId?: string) => { connectionId?: string } | undefined>(() => undefined)
  }
  const path = options?.path ?? '/repo'
  const worktree = {
    id: 'wt-1',
    repoId: 'repo-1',
    path,
    ...(options?.hostId ? { hostId: options.hostId } : {})
  }
  const executionHostId = (): ExecutionHostId => {
    const connectionId = store.getRepo(worktree.repoId)?.connectionId
    return normalizeExecutionHostId(options?.hostId) ?? getConnectionExecutionHostId(connectionId)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: file reads use only these host capabilities.
  const host = {
    requireStore: () => store,
    resolveRuntimeFileTarget: vi.fn(async () => ({
      worktree,
      executionHostId: executionHostId()
    }))
  } as unknown as Pick<RuntimeFileCommandHost, 'requireStore' | 'resolveRuntimeFileTarget'>
  return { commands: new RuntimeFileReads(host), store }
}
