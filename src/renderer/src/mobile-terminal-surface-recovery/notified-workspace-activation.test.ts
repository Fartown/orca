import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createWorktreeEventRuntime } from '../hooks/ipc-events/workspace-catalog/worktree-event-runtime'

const { activateAndRevealWorktree, activateAndRevealWorkspace } = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  activateAndRevealWorkspace: vi.fn()
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorktree,
  activateAndRevealWorkspace
}))

const initialState = useAppStore.getState()

afterEach(() => {
  vi.restoreAllMocks()
  useAppStore.setState(initialState, true)
  vi.clearAllMocks()
})

it('refreshes the folder catalog and dispatches a folder activation through the workspace entry', async () => {
  const fetchCatalog = vi.fn().mockResolvedValue(undefined)
  const fetchWorktrees = vi.fn()
  useAppStore.setState({ fetchReposForAllHosts: fetchCatalog, fetchWorktrees })
  const unsubs: (() => void)[] = []
  const runtime = createWorktreeEventRuntime(unsubs, () => false)
  try {
    await runtime.activateNotifiedWorktree(
      {
        type: 'activateWorktree',
        repoId: 'folder-group:g1',
        worktreeId: 'folder:f1',
        navigation: 'all'
      },
      { allowRuntimeEnvironment: true, executionHostId: 'runtime:host-a' }
    )

    expect(fetchCatalog).toHaveBeenCalledOnce()
    expect(fetchWorktrees).not.toHaveBeenCalled()
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith(
      'folder:f1',
      expect.objectContaining({ executionHostId: 'runtime:host-a' })
    )
    expect(activateAndRevealWorktree).not.toHaveBeenCalled()
  } finally {
    unsubs.forEach((unsubscribe) => unsubscribe())
  }
})
