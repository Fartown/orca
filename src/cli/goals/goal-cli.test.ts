import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('../runtime/client', async () => {
  const { createRuntimeClientModuleMock } =
    await import('../../fork-test-support/cli/index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('../runtime/launch', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  serveOrcaApp: serveOrcaAppMock
}))

vi.mock('../runtime/profile/metadata', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDefaultUserDataPath: getDefaultUserDataPathMock
}))

vi.mock('../runtime/pairing/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('../../shared/remote-runtime/host-store/runtime-environment-store', () => ({
  listEnvironments: listEnvironmentsMock
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } =
    await import('../../fork-test-support/cli/index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from '../index'
import { useWorktreeAwarenessEnvironment } from '../../fork-test-support/cli/index-test-harness'
import { okFixture } from '../../fork-test-support/cli/runtime/fixtures/runtime-rpc-fixtures'

const DRAFT_ID = '3f2a0c4e-1b2d-4c3e-8f90-123456789abc'
const GOAL_ID = '7d2b7bef-d22b-4252-9b32-7af3de1676be'
const terminal = {
  handle: 'term_1',
  incarnationId: 'inc-1',
  worktreeId: 'repo-1::/repo/checkout',
  worktreePath: '/repo/checkout',
  agentIdentity: 'claude'
}
const readyDraft = {
  draftId: DRAFT_ID,
  status: 'ready',
  objective: '把界面还原',
  judge: 'codex',
  workspace: '/repo/checkout',
  document: '## 验收清单\n- **UI-01 首页**：……',
  documentPath: '/home/u/.orca-goal/v2/drafts/x/acceptance.md',
  error: null
}

function host(draft: Record<string, unknown> | null = readyDraft, terminalOver = {}) {
  callMock.mockImplementation(async (method: string) => {
    switch (method) {
      case 'terminal.show':
        return okFixture('show', { terminal: { ...terminal, ...terminalOver } })
      case 'goals.draftAcceptance':
        return okFixture('draft', { ...readyDraft, status: 'generating', document: null })
      case 'goals.getAcceptanceDraft':
        return okFixture('get', draft)
      case 'goals.get':
        return okFixture('get', { goalId: GOAL_ID, runtimeFence: 4, runId: 'run-1' })
      default:
        return okFixture('op', {
          clientOperationId: 'c',
          goalId: GOAL_ID,
          status: 'accepted',
          code: 'ok',
          message: ''
        })
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const params = (method: string): Record<string, unknown> | undefined =>
  callMock.mock.calls.find((call) => call[0] === method)?.[1]

describe('orca goal', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('drafts a checklist for the terminal with the objective verbatim and the other model as guard', async () => {
    host()
    await main(['goal', 'draft', '--terminal', 'term_1', '--objective', '把界面还原'], '/repo')
    expect(params('goals.draftAcceptance')).toMatchObject({
      authorityExecutionHostId: 'local',
      objective: '把界面还原',
      judge: 'codex',
      binding: { worktree: terminal.worktreeId, terminal: 'term_1', expectedIncarnationId: 'inc-1' }
    })
    expect(params('goals.create')).toBeUndefined()
  })

  it('starts from a ready draft with the draft’s objective, guard and checklist', async () => {
    host()
    await main(['goal', 'start', DRAFT_ID, '--terminal', 'term_1', '--max-minutes', '0'], '/repo')
    const create = params('goals.create')
    expect(create?.spec).toMatchObject({
      objective: '把界面还原',
      judge: 'codex',
      acceptanceDocument: readyDraft.document
    })
    expect(create?.budget).toEqual({ maxTurns: 20, maxMinutes: 0, checkTimeoutSeconds: 900 })
    expect(create?.payloadFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses to start a draft that is still being written', async () => {
    host({ ...readyDraft, status: 'generating', document: null })
    await main(['goal', 'start', DRAFT_ID, '--terminal', 'term_1'], '/repo')
    expect(params('goals.create')).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  it('refuses a checklist written for another workspace', async () => {
    host(readyDraft, { worktreePath: '/repo/other' })
    await main(['goal', 'start', DRAFT_ID, '--terminal', 'term_1'], '/repo')
    expect(params('goals.create')).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  it('stops with the goal’s current fence and run', async () => {
    host()
    await main(['goal', 'stop', GOAL_ID], '/repo')
    expect(params('goals.control')).toMatchObject({
      goalId: GOAL_ID,
      expectedRuntimeFence: 4,
      expectedRunId: 'run-1',
      action: 'stop'
    })
  })
})
