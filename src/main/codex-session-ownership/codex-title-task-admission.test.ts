import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { AgentHookServer } from '../agent-hooks/server'
import { normalizeHookPayload } from '../../shared/agent-hook-listener'
import { makePaneKey } from '../../shared/stable-pane-id'
import {
  clearAllListenerCaches,
  clearPaneCacheState,
  clearPaneTurnCacheState,
  createHookListenerState,
  movePaneCacheState,
  paneHasStateClaims
} from '../../shared/agent-hook-listener/listener-state'
import { shouldRejectCodexTitleTask } from '../../shared/session-names/codex-title-task-admission'

const PANE = makePaneKey('codex-core', '11111111-1111-4111-8111-111111111111')
const A = '01a08909-668e-72f2-bb27-ffb85663a602'
const B = '01a08909-7197-7261-b4d9-fa4cf8450d12'
const TITLE_PROMPT =
  'Generate a concise, single-line task title of at most 36 characters and under five words where possible. Start with an imperative verb.'
const servers: AgentHookServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop()
  }
})

function createServer() {
  const server = new AgentHookServer()
  servers.push(server)
  return server
}

describe('Codex normal startup internal title task', () => {
  it('keeps the real session and prompt through A → title task B → A Stop → B Stop', () => {
    const server = createServer()
    const state = server._getStateForTests()
    const accept = (id: string, name: string, extra: Record<string, unknown> = {}) => {
      const event = normalizeHookPayload(
        state,
        'codex',
        {
          paneKey: PANE,
          payload: {
            session_id: id,
            hook_event_name: name,
            transcript_path: id === B ? null : join('fixture', `rollout-${id}.jsonl`),
            ...extra
          }
        },
        'production'
      )
      if (event) {
        server.ingestRemote(event, 'test-host')
      }
      return event
    }
    accept(A, 'SessionStart')
    accept(A, 'UserPromptSubmit', { prompt: 'Reply CORE_CODEX_OK', model: 'gpt-6-astra' })
    const incumbent = state.lastStatusByPaneKey.get(PANE)
    expect(accept(B, 'SessionStart', { model: 'gpt-5.6-luna' })).toBeNull()
    expect(
      accept(B, 'UserPromptSubmit', { prompt: TITLE_PROMPT, model: 'gpt-5.6-luna' })
    ).toBeNull()
    expect(state.lastStatusByPaneKey.get(PANE)).toBe(incumbent)
    expect(state.lastPromptByPaneKey.get(PANE)).toBe('Reply CORE_CODEX_OK')
    expect(accept(A, 'Stop')?.payload).toMatchObject({
      state: 'done',
      prompt: 'Reply CORE_CODEX_OK',
      model: 'gpt-6-astra'
    })
    expect(
      accept(B, 'Stop', { last_assistant_message: '{"title":"Reply CORE_CODEX_OK"}' })
    ).toBeNull()
    expect(state.lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
    expect(accept('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'SessionStart')).not.toBeNull()
  })

  it('rejects an older relay title task without mistaking its cached echo for the parent prompt', () => {
    const server = createServer()
    const accept = (id: string, name: string, prompt: string, explicit = false) =>
      server.ingestRemote(
        {
          paneKey: PANE,
          source: 'codex',
          hookEventName: name,
          hasExplicitPrompt: explicit,
          providerSession: {
            key: 'session_id',
            id,
            ...(id === A ? { transcriptPath: join('fixture', `rollout-${id}.jsonl`) } : {})
          },
          payload: { agentType: 'codex', state: name === 'Stop' ? 'done' : 'working', prompt }
        },
        'older-relay'
      )
    accept(A, 'UserPromptSubmit', 'Reply CORE_CODEX_OK', true)
    accept(B, 'SessionStart', '')
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
    accept(B, 'UserPromptSubmit', TITLE_PROMPT, true)
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
    accept(A, 'Stop', TITLE_PROMPT)
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.payload).toMatchObject({
      state: 'done',
      prompt: 'Reply CORE_CODEX_OK'
    })
    accept(B, 'Stop', 'Reply CORE_CODEX_OK')
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
  })

  it('keeps task suppression through the parent turn, and tears it down with the pane', () => {
    const state = createHookListenerState()
    expect(shouldRejectCodexTitleTask(state, PANE, B, TITLE_PROMPT)).toBe(true)
    clearPaneTurnCacheState(state, PANE)
    expect(shouldRejectCodexTitleTask(state, PANE, B, undefined)).toBe(true)
    expect(paneHasStateClaims(state, PANE)).toBe(false)
    movePaneCacheState(state, PANE, 'moved-pane')
    expect(shouldRejectCodexTitleTask(state, PANE, B, undefined)).toBe(false)
    expect(shouldRejectCodexTitleTask(state, 'moved-pane', B, undefined)).toBe(true)
    clearPaneCacheState(state, 'moved-pane')
    expect(state.codexTitleTaskSessionsByPaneKey.size).toBe(0)
    shouldRejectCodexTitleTask(state, PANE, B, TITLE_PROMPT)
    clearAllListenerCaches(state)
    expect(state.codexTitleTaskSessionsByPaneKey.size).toBe(0)
  })
})
