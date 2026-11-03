// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VaultSessionRow } from '../components/right-sidebar/AiVaultSessionRow'
import { TooltipProvider } from '../components/ui/tooltip'
import { useCanonicalSessionTitles } from '../components/right-sidebar/use-canonical-session-titles'
import {
  canonicalSessionTitleKey,
  registerCanonicalSessionTitleProvider
} from '../lib/canonical-session-titles'
import { sessionNameStore } from './session-name-store'
import { getScannedSessionDisplayName } from './session-name-display'
import type { AiVaultSession } from '../../../shared/ai-vault-types'

const key = canonicalSessionTitleKey('local', 'codex', 's1')
const session = {
  id: 'local:codex:s1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 's1',
  title: '继续',
  generatedTitle: '运行测试',
  providerName: { kind: 'named', title: 'Provider 会话名', field: 'session_index.thread_name' },
  filePath: '/tmp/name-test.jsonl',
  codexHome: null,
  modifiedAt: '2026-09-09T00:00:00Z',
  cwd: null,
  branch: null,
  model: null,
  createdAt: null,
  updatedAt: null,
  totalTokens: 0,
  resumeCommand: 'codex resume s1',
  messageCount: 2,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  subagent: null
} as AiVaultSession
let stopManual: () => void
let manual: Map<string, string>
beforeEach(() => {
  sessionNameStore.reset()
  manual = new Map()
  stopManual = registerCanonicalSessionTitleProvider({
    index: () => manual,
    get: (host, agent, id) => manual.get(canonicalSessionTitleKey(host, agent, id)),
    subscribe: () => () => {}
  })
  Object.assign(window, {
    api: { aiVault: { resolveSessionTitles: vi.fn(async () => ({ titles: [] })) } }
  })
})
afterEach(() => {
  cleanup()
  stopManual()
  sessionNameStore.reset()
  vi.restoreAllMocks()
})

it('uses the same native name in the History search index and row lookup, then updates on rename', () => {
  const { result } = renderHook(() => useCanonicalSessionTitles([session]))
  expect(result.current.canonicalTitleBySessionKey.get(key)).toBe('Provider 会话名')
  expect(result.current.getCanonicalTitle(session)).toBe('Provider 会话名')
  act(() =>
    sessionNameStore.publish('local', {
      titles: [
        {
          agent: 'codex',
          sessionId: 's1',
          title: '继续',
          providerName: {
            kind: 'named',
            title: 'Provider 改名',
            field: 'session_index.thread_name'
          }
        }
      ]
    })
  )
  expect(result.current.getCanonicalTitle(session)).toBe('Provider 改名')
  expect(result.current.canonicalTitleBySessionKey.get(key)).toBe('Provider 改名')
  expect(session.title).toBe('继续')
})

it('renders and drags the same name without displaying a stale scanner title next to it', () => {
  render(
    <TooltipProvider>
      <VaultSessionRow
        session={session}
        canonicalTitle="旧人工名"
        liveState={null}
        resumeStartup={{ command: 'codex resume s1' }}
        realHomeResumeStartup={{ command: 'codex resume s1' }}
        worktreeInfo={null}
        vaultScope="all"
        detailsExpanded={false}
        resumeDisabled={false}
        showJumpToWorktree={false}
        onToggleDetails={vi.fn()}
        onResume={vi.fn()}
        resumeLabel="Resume"
        resumeActions={{
          worktree: { worktreeId: null, disabled: true },
          newTab: { worktreeId: null, disabled: true }
        }}
        onResumeInWorktree={vi.fn()}
        onResumeInNewTab={vi.fn()}
        onCopyId={vi.fn()}
        onCopyPath={vi.fn()}
        onRequestDelete={vi.fn()}
      />
    </TooltipProvider>
  )
  // The row's manual name outranks the native one (REQ-025).
  const title = screen.getByText('旧人工名')
  expect(screen.queryByText('Provider 会话名')).toBeNull()
  expect(screen.queryByText('继续')).toBeNull()
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
  fireEvent.dragStart(title, { dataTransfer })
  expect(
    dataTransfer.setData.mock.calls.some(
      ([, value]) => typeof value === 'string' && value.includes('旧人工名')
    )
  ).toBe(true)
})

it('puts the legacy manual name first and retains a newer native clear across stale scans', () => {
  manual.set(key, '旧人工名')
  sessionNameStore.seed([session])
  expect(getScannedSessionDisplayName(session)).toBe('旧人工名')
  sessionNameStore.publish('local', {
    nameEvidence: [{ agent: 'codex', sessionId: 's1', providerName: { kind: 'cleared' } }],
    titles: []
  })
  expect(getScannedSessionDisplayName(session)).toBe('旧人工名')
  stopManual()
  expect(getScannedSessionDisplayName(session)).toBe('运行测试')
})
