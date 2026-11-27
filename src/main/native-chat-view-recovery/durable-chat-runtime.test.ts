import '../runtime/rpc/dispatch/testing/unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from '../../fork-test-support/main/runtime/terminal/input/agent-prompt-submission-runtime-test-fixture'
import { OrchestrationDb } from '../runtime/orchestration/db/orchestration-db'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { TERMINAL_METHODS } from '../runtime/rpc/methods/terminal/terminal'
import {
  WRITE_ACCEPTED,
  writeUnverifiable
} from '../../shared/terminal/pty/lifecycle/pty-write-settlement'
import type { WriteSettlement } from '../../shared/terminal/pty/lifecycle/pty-write-settlement'
import { AGENT_TUI_CLEAR_INPUT_MAX } from '../../shared/agent-launch/startup/agent-tui-input-clear'

const boundary = vi.hoisted(() => ({
  sessionId: 'session',
  afterMessageId: 'host-boundary',
  afterByteOffset: 500,
  transcriptPath: '/fixture/transcript.jsonl',
  fileIdentity: 'dev:ino',
  boundaryFingerprint: 'boundary',
  empty: false,
  submittedAt: 100
}))
vi.mock('./durable-chat-transcript-boundary', () => ({
  durableChatProviderSession: vi.fn(),
  durableChatSubmissionSession: vi.fn(),
  captureDurableChatTranscriptBoundary: vi.fn(async () => boundary)
}))
const readWorktrees = vi.hoisted(() => async () => [
  { path: '/tmp/worktree-a', head: 'abc', branch: 'chat', isBare: false, isMainWorktree: false }
])
vi.mock('../git/worktrees/catalog/worktree-scan-cache', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listWorktrees: readWorktrees,
  listWorktreesSharedStrict: readWorktrees
}))
vi.mock('../git/worktrees/catalog/worktree-listing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listWorktreesStrict: readWorktrees
}))
afterEach(() => vi.useRealTimers())

async function fixture(settle: (data: string, index: number) => Promise<WriteSettlement>) {
  const f = await createAgentPromptSubmissionRuntime(() => {}, 'codex')
  const db = new OrchestrationDb(':memory:')
  f.runtime.setOrchestrationDb(db)
  const writes: string[] = []
  const raw = vi.fn(() => true)
  f.runtime.setPtyController({
    spawn: async () => ({ id: 'unused' }),
    write: raw,
    writeWithSettlement: async (_id, data) => {
      writes.push(data)
      return settle(data, writes.length)
    },
    kill: () => true,
    getForegroundProcess: async () => 'codex'
  })
  Object.defineProperty(f.runtime, 'readCurrentTerminalWaitScreen', {
    value: async () => ({ draft: '' })
  })
  vi.spyOn(f.runtime, 'getTerminalAgentStatus').mockResolvedValue({
    handle: f.handle,
    isRunningAgent: true,
    status: 'idle'
  })
  const binding = f.runtime.getTerminalPromptRequestBinding(f.handle)
  const request = {
    id: 'rpc',
    authToken: 'token',
    method: 'terminal.send',
    orchestrationRequestId: 'durable-chat-test',
    params: {
      terminal: f.handle,
      text: 'chat prompt',
      enter: true,
      agentPrompt: true,
      client: { id: 'orca-desktop-chat', type: 'desktop' },
      chatComposer: {
        clearInput: '\x15',
        imagePaths: [],
        expectedSessionId: 'session',
        expectedPtyId: binding.ptyId,
        expectedIncarnation: binding.processIncarnation
      }
    }
  }
  return {
    ...f,
    db,
    writes,
    raw,
    request,
    dispatcher: new RpcDispatcher({ runtime: f.runtime, methods: TERMINAL_METHODS })
  }
}

describe('durable Chat runtime submission', () => {
  it('does not send Enter to a shell when the agent exits after accepting the body', async () => {
    const f = await fixture(async () => WRITE_ACCEPTED)
    vi.mocked(f.runtime.getTerminalAgentStatus).mockImplementation(async () => ({
      handle: f.handle,
      isRunningAgent: f.writes.length < 2,
      status: 'idle'
    }))
    vi.useFakeTimers()
    try {
      const result = f.dispatcher.dispatch(f.request)
      await vi.advanceTimersByTimeAsync(5000)
      expect(await result).toMatchObject({ ok: true, result: { send: { accepted: false } } })
      expect(f.writes).toHaveLength(2)
      expect(f.writes).not.toContain('\r')
    } finally {
      f.db.close()
    }
  })

  it('waits for body settlement before its only Enter and persists the host transcript boundary', async () => {
    let release: (value: WriteSettlement) => void = () => {
      throw new Error('body not reached')
    }
    const body = new Promise<WriteSettlement>((resolve) => {
      release = resolve
    })
    const f = await fixture(async (_data, index) => (index === 2 ? body : WRITE_ACCEPTED))
    vi.useFakeTimers()
    try {
      const result = f.dispatcher.dispatch(f.request)
      await vi.advanceTimersByTimeAsync(2500)
      expect(f.writes).toEqual([AGENT_TUI_CLEAR_INPUT_MAX, '\x1b[200~chat prompt\x1b[201~'])
      release(WRITE_ACCEPTED)
      await vi.advanceTimersByTimeAsync(2500)
      expect(await result).toMatchObject({
        ok: true,
        result: { send: { accepted: true, prompt: { chatTranscript: boundary } } }
      })
      expect(f.writes.filter((data) => data === '\r')).toHaveLength(1)
      const before = [...f.writes]
      expect(await f.dispatcher.dispatch(f.request)).toMatchObject({ ok: true })
      expect(f.writes).toEqual(before)
      expect(f.raw).not.toHaveBeenCalled()
    } finally {
      f.db.close()
    }
  })

  it.each([1, 2])(
    'stops all suffixes after an ambiguous write at boundary %s, including duplicate requests',
    async (index) => {
      const f = await fixture(async (_data, current) =>
        current === index ? writeUnverifiable('settlement_timeout', true) : WRITE_ACCEPTED
      )
      vi.useFakeTimers()
      try {
        const result = f.dispatcher.dispatch(f.request)
        await vi.advanceTimersByTimeAsync(2500)
        expect(await result).toMatchObject({ ok: false })
        expect(f.writes).toHaveLength(index)
        expect(f.writes).not.toContain('\r')
        const replay = await f.dispatcher.dispatch(f.request)
        expect(replay).toMatchObject({ ok: false, error: { code: 'operation_unknown' } })
        expect(f.writes).toHaveLength(index)
        expect(f.raw).not.toHaveBeenCalled()
      } finally {
        f.db.close()
      }
    }
  )
})
