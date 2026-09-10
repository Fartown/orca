// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAgentRowConversationName } from '../components/dashboard/use-agent-row-conversation-name'
import type { DashboardAgentRow } from '../components/dashboard/useDashboardData'
import { sessionNameStore } from './session-name-store'
import type { AiVaultSessionTitlesArgs } from '../../../shared/ai-vault-session-title'

const state = vi.hoisted(() => ({
  settings: { tabAutoGenerateTitle: true },
  tabsByWorktree: {},
  terminalLayoutsByTabId: {},
  runtimePaneTitlesByTabId: {}
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
const row = (id: string, extra: Partial<DashboardAgentRow> = {}) =>
  ({
    paneKey: `tab-${id}:11111111-1111-4111-8111-111111111111`,
    agentType: 'codex',
    rowSource: 'live',
    tab: { id: `tab-${id}`, worktreeId: 'folder', title: '继续' },
    entry: { providerSession: { id, key: `codex:${id}` }, prompt: '继续' },
    ...extra
  }) as DashboardAgentRow

beforeEach(() => sessionNameStore.reset())
afterEach(() => {
  cleanup()
  sessionNameStore.reset()
})

it('reads both pane-owned identities and updates a row without any winning tab title slot', async () => {
  const resolve = vi.fn(async (args: AiVaultSessionTitlesArgs) => ({
    titles: args.requests.map((request) => ({
      ...request,
      title: '继续',
      providerName: {
        kind: 'named' as const,
        title: `Provider ${request.sessionId}`,
        field: 'session_index.thread_name'
      }
    }))
  }))
  Object.assign(window, { api: { aiVault: { resolveSessionTitles: resolve } } })
  const { result } = renderHook(() => [
    useAgentRowConversationName(row('A')),
    useAgentRowConversationName(row('B'))
  ])
  await waitFor(() => expect(result.current).toEqual(['Provider A', 'Provider B']))
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(resolve.mock.calls[0]![0].requests.map((request) => request.sessionId)).toEqual(['A', 'B'])
})

it('does not request a native name for a synthetic child that does not own a pane', async () => {
  const resolve = vi.fn(async () => ({ titles: [] }))
  Object.assign(window, { api: { aiVault: { resolveSessionTitles: resolve } } })
  const { result } = renderHook(() =>
    useAgentRowConversationName(row('child', { rowSource: 'subagent' }))
  )
  expect(result.current).toBeNull()
  await Promise.resolve()
  expect(resolve).not.toHaveBeenCalled()
})
