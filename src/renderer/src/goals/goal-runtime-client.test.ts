import { afterEach, expect, it, vi } from 'vitest'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { GoalRuntimeClient, GoalRuntimeUnsupportedError } from './goal-runtime-client'
import { goalDomainStore } from './goals-domain-store'

vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
afterEach(() => vi.clearAllMocks())
const ready = {
  status: 'ready',
  reason: null,
  supports: { localTerminal: true, structured: false, ssh: true, wsl: false }
} as const

it('pins SSH requests to their host even after the selected host changes', async () => {
  vi.mocked(callRuntimeRpc).mockResolvedValue(ready)
  const client = new GoalRuntimeClient('ssh:one')
  goalDomainStore.getState().setRoute('ssh:two')
  await client.status()
  expect(callRuntimeRpc).toHaveBeenCalledWith({ kind: 'local' }, 'goals.status', {
    authorityExecutionHostId: 'ssh:one'
  })
})

it('addresses a paired runtime directly and uses its local authority', async () => {
  vi.mocked(callRuntimeRpc).mockResolvedValue(ready)
  await new GoalRuntimeClient('runtime:server').status()
  expect(callRuntimeRpc).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: 'server' },
    'goals.status',
    { authorityExecutionHostId: 'local' }
  )
})

it('reports an older host without retrying a local service', async () => {
  vi.mocked(callRuntimeRpc).mockRejectedValue(new Error('Method not found: goals.status'))
  await expect(new GoalRuntimeClient('ssh:old').status()).rejects.toBeInstanceOf(
    GoalRuntimeUnsupportedError
  )
  expect(callRuntimeRpc).toHaveBeenCalledTimes(1)
})

it('reports unsupported draft deletion on older hosts without falling back or hiding a row', async () => {
  vi.mocked(callRuntimeRpc).mockRejectedValue(
    new Error('Method not found: goals.deleteEditorDraft')
  )
  await expect(
    new GoalRuntimeClient('ssh:old').deleteEditorDraft({
      editorDraftId: 'draft',
      expectedRevision: 1
    })
  ).rejects.toThrow('does not support deleting Goal drafts')
  expect(callRuntimeRpc).toHaveBeenCalledTimes(1)
})
