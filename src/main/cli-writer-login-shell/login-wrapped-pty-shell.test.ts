import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import { OrcaRuntimeService } from '../runtime/orca-runtime'

const snapshot = vi.hoisted(() => vi.fn())
vi.mock('../../shared/process-table-snapshot-reader', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFreshShellForegroundSnapshot: snapshot
}))

// Rows as `ps` reports a macOS pane Orca spawned through the TCC login wrapper.
const login = {
  pid: 10,
  ppid: 1,
  stat: 'Ss',
  command:
    '/usr/bin/login -flpq user /bin/bash --noprofile --norc -p -c export SHELL="$1"; shift; exec -l -- "$@" orca-tcc-login /bin/zsh /bin/zsh -l'
}
const shell = { pid: 11, ppid: 10, stat: 'S+', command: '-/bin/zsh -l' }
const codex = {
  pid: 12,
  ppid: 11,
  stat: 'S+',
  command: '/Users/user/.codex/packages/standalone/current/codex --no-daemon'
}
const refusal = {
  refusal: { code: 'agent_session_conflict', details: { reason: 'conversationHeldElsewhere' } }
}

function runtimeWithCodexPane() {
  const leaf = '11111111-1111-4111-8111-111111111111'
  const paneKey = `tab-a:${leaf}`
  const runtime = new OrcaRuntimeService(null, undefined, {
    getAgentProviderSessionSnapshot: () => [],
    readHookCliWriterObservation: () => null
  })
  runtime.registerPty('pty', 'workspace', null, {
    tabId: 'tab-a',
    leafId: leaf,
    incarnationId: 'i1'
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the census reads only listProcesses.
  runtime.setPtyController({
    listProcesses: async () => [{ id: 'pty', rootProcessId: login.pid, incarnationId: 'i1' }]
  } as never)
  const event: EnrichedAgentHookEventPayload = {
    paneKey,
    connectionId: null,
    receivedAt: 1,
    stateStartedAt: 1,
    providerSession: { key: 'session_id', id: 'conversation' },
    payload: { state: 'done', prompt: '', agentType: 'codex' }
  }
  runtime.recordCliWriterConversation(event)
  return {
    fromHistory: () =>
      runtime.assertStructuredAdoptionTerminalWritersExited('codex', 'conversation'),
    fromPane: () =>
      runtime.assertStructuredAdoptionTerminalWritersExited('codex', 'conversation', {
        workspaceId: 'workspace',
        paneKey
      })
  }
}

beforeEach(() => vi.clearAllMocks())
describe.skipIf(process.platform === 'win32')(
  'terminal writer census behind the macOS login wrapper',
  () => {
    it('admits a chat once the agent exits, and refuses while it or another job still runs', async () => {
      const pane = runtimeWithCodexPane()
      snapshot.mockResolvedValue([login, shell, codex])
      await expect(pane.fromHistory()).rejects.toMatchObject(refusal)
      await expect(pane.fromPane()).rejects.toMatchObject(refusal)

      snapshot.mockResolvedValue([login, shell])
      await expect(pane.fromHistory()).resolves.toBeUndefined()
      await expect(pane.fromPane()).resolves.toBeUndefined()

      // A background or suspended job under the shell still holds the terminal.
      for (const stat of ['SN', 'T']) {
        snapshot.mockResolvedValue([login, shell, { ...codex, stat }])
        await expect(pane.fromHistory()).rejects.toMatchObject(refusal)
        await expect(pane.fromPane()).rejects.toMatchObject(refusal)
      }

      snapshot.mockResolvedValue([login, shell, { ...codex, ppid: login.pid, stat: 'S' }])
      await expect(pane.fromHistory()).rejects.toMatchObject(refusal)
      await expect(pane.fromPane()).rejects.toMatchObject(refusal)
    })
  }
)
