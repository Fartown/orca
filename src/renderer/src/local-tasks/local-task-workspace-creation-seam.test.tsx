// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useQuickCreationExecution } from '@/hooks/composer-state/quick-creation-execution'
import type { PreparedQuickSubmit } from '@/hooks/composer-state/composer-submit-model'

const creation = vi.hoisted(() => ({ run: vi.fn(() => 'creation-1') }))
vi.mock('@/lib/worktree-creation-flow', () => ({ runBackgroundWorktreeCreation: creation.run }))

const prepared: PreparedQuickSubmit = {
  submitLinkedWorkItem: null,
  agent: null,
  submitLinkedIssueNumber: null,
  submitLinkedPR: null,
  submitTitleName: null,
  nameIsAutoManaged: false,
  smartGitHubCreateNames: { workspaceName: 'workspace', displayName: undefined },
  workspaceName: 'workspace',
  nameWasGenerated: false,
  smartSubmitBaseBranch: undefined,
  submitCompareBaseRef: undefined,
  submitPushTarget: undefined,
  submitBranchNameOverride: undefined,
  effectiveSetupDecision: 'inherit',
  hookPreparation: undefined,
  linkedLinearIssue: undefined,
  linkedLinearIssueWorkspaceId: undefined,
  linkedLinearIssueOrganizationUrlKey: undefined,
  effectiveBranchNameOverride: undefined,
  submitBaseBranch: undefined,
  createDisplayName: undefined,
  pendingFirstAgentMessageRename: false,
  trimmedNote: ''
}

const input = {
  clearNewWorkspaceDraft: vi.fn(),
  createMultiple: false,
  effectivePresetId: null,
  ephemeralVmRecipes: [],
  ephemeralVmsEnabled: false,
  isSubmissionCancelled: () => false,
  linkedGitLabIssue: null,
  linkedGitLabMR: null,
  normalizedSparseDirectories: [],
  onCreated: vi.fn(),
  parentWorktreeId: null,
  persistDraft: false,
  persistSetupAgentStartupPolicy: async () => true,
  prepareQuickSubmit: async () => prepared,
  resetForNextCreate: vi.fn(),
  resolvedInitialWorkspaceStatus: undefined,
  selectedEphemeralVmRecipeId: null,
  selectedRepoAgentLaunchFact: { kind: 'withheld', reason: 'agentless' },
  selectedRepoExecutionHostId: null,
  selectedRepoIsGit: true,
  selectedRepoIsRemote: false,
  selectedRepoTarget: null,
  selectedRepoStartupShell: undefined,
  selectedWorkspaceTarget: { status: 'unavailable', reason: 'no-eligible-repo' },
  settings: null,
  sparseEnabled: false,
  taskSourceContext: null,
  telemetrySource: undefined
} satisfies Parameters<typeof useQuickCreationExecution>[0]

beforeEach(() => creation.run.mockClear())

it('starts quick workspace creation when no start callback is supplied', async () => {
  const { result } = renderHook(() => useQuickCreationExecution(input))

  await act(async () => {
    await result.current.executeQuickCreation({ kind: 'none' }, null, 'workspace', null, 'repo-1')
  })

  expect(creation.run).toHaveBeenCalledOnce()
  expect(creation.run).toHaveBeenCalledWith(expect.objectContaining({ repoId: 'repo-1' }))
})

it('reports the started creation after starting it', async () => {
  const onCreationStarted = vi.fn()
  const { result } = renderHook(() => useQuickCreationExecution(input))

  await act(async () => {
    await result.current.executeQuickCreation({ kind: 'none' }, null, 'workspace', null, 'repo-1', {
      onCreationStarted
    })
  })

  expect(creation.run).toHaveBeenCalledOnce()
  expect(onCreationStarted).toHaveBeenCalledWith('creation-1')
})

it('sends the note typed in the composer after the task prompt', async () => {
  const { result } = renderHook(() =>
    useQuickCreationExecution({
      ...input,
      prepareQuickSubmit: async () => ({
        ...prepared,
        agent: 'claude',
        trimmedNote: 'Keep the CSV header as is.'
      }),
      selectedRepoAgentLaunchFact: { kind: 'known', platform: 'darwin', hostKind: 'local' }
    })
  )

  await act(async () => {
    await result.current.executeQuickCreation(
      { kind: 'none' },
      'claude',
      'workspace',
      null,
      'repo-1',
      {
        launchPrompt: 'SHOP-12 Order export'
      }
    )
  })

  expect(creation.run).toHaveBeenCalledWith(
    expect.objectContaining({ quickPrompt: 'SHOP-12 Order export\n\nKeep the CSV header as is.' })
  )
})
