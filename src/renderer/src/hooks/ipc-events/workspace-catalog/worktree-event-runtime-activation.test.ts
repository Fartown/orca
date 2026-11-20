import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  createWorktreeEventRuntime,
  recentlyRenamedWorktreeIdExpiry
} from './worktree-event-runtime'

const { activateAndRevealWorktree, activateAndRevealWorkspace } = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  activateAndRevealWorkspace: vi.fn()
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorktree,
  activateAndRevealWorkspace
}))

const initialState = useAppStore.getState()
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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useAppStore.setState(initialState, true)
  vi.clearAllMocks()
})

import * as drafts from '@/components/native-chat/drafts/native-chat-draft-reset'
import * as draftsOwner1 from '@/components/native-chat/drafts/native-chat-launch-draft-source'
import * as draftsOwner2 from '@/components/native-chat/drafts/native-chat-composer-draft-store'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
it('the conditionally installed qualified rename keeps ordinary setup content and other-host input', async () => {
  drafts.clearNativeChatComposerDraftsForTests()
  const from = draftsOwner1.nativeChatLaunchPromptDraftScopeKey('repo::/old', 'claude', 'local')
  const twin = draftsOwner1.nativeChatLaunchPromptDraftScopeKey(
    'repo::/old',
    'claude',
    'runtime:other'
  )
  draftsOwner2.updateNativeChatComposerDraft(from, { text: 'moving' }, 'immediate')
  draftsOwner2.updateNativeChatComposerDraft(twin, { text: 'twin' }, 'immediate')
  const fetched = Promise.withResolvers<void>()
  vi.spyOn(initialState, 'fetchWorktrees').mockImplementation(async () => {
    fetched.resolve()
    return false
  })
  useAppStore.setState({
    repos: [{ ...TEST_REPO, id: 'repo' }],
    fetchWorktrees: initialState.fetchWorktrees,
    migrateWorktreeIdentity: vi.fn()
  })
  const unsubs: (() => void)[] = []
  const runtime = createWorktreeEventRuntime(unsubs, () => false)
  runtime.worktreeChangeRefreshQueue.enqueue({
    repoId: 'repo',
    forceLocalOwner: true,
    renamed: { oldWorktreeId: 'repo::/old', newWorktreeId: 'repo::/new' }
  })
  await fetched.promise
  expect(
    draftsOwner2.readNativeChatComposerDraft(
      draftsOwner1.nativeChatLaunchPromptDraftScopeKey('repo::/new', 'claude', 'local')
    ).text
  ).toBe('moving')
  expect(draftsOwner2.readNativeChatComposerDraft(twin).text).toBe('twin')
  unsubs.forEach((unsubscribe) => unsubscribe())
  drafts.clearNativeChatComposerDraftsForTests()
  recentlyRenamedWorktreeIdExpiry.clear()
})
