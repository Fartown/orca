// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { AiVaultListRow } from '../components/right-sidebar/AiVaultVirtualRow'
import { sessionNameStore } from './session-name-store'

// Every row mounted: the list's lookup is what is under test, not virtualization.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getItemKey: (index: number) => string }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * 40
      })),
    getTotalSize: () => options.count * 40,
    measureElement: () => {},
    scrollOffset: 0
  })
}))
// The row shows whatever title lookup the list hands it, so the assertion reads the list's wiring.
vi.mock('../components/right-sidebar/AiVaultVirtualRow', () => ({
  AiVaultVirtualRow: ({
    row,
    getCanonicalTitle
  }: {
    row: AiVaultListRow | undefined
    getCanonicalTitle?: (session: AiVaultSession) => string | undefined
  }) =>
    row?.type === 'session' ? (
      <span data-testid={row.session.id}>
        {getCanonicalTitle?.(row.session) ?? 'no canonical lookup'}
      </span>
    ) : null
}))

import { AiVaultSessionVirtualList } from '../components/right-sidebar/AiVaultSessionVirtualList'

const session: AiVaultSession = {
  id: 'local:codex:s1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 's1',
  title: 'Scanned prompt',
  filePath: '/tmp/history-list-name.jsonl',
  codexHome: null,
  modifiedAt: '2026-10-05T00:00:00Z',
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
}

function renderList(): void {
  render(
    <AiVaultSessionVirtualList
      groups={[{ key: 'all', label: null, sessions: [session] }]}
      collapsedGroups={new Set()}
      loading={false}
      sessionsCount={1}
      filteredSessionsCount={1}
      noAgentsSelected={false}
      error={null}
      vaultScope="all"
      buildResumeStartup={vi.fn()}
      getOriginalPaneTarget={() => null}
      isStructuredSessionOpen={() => false}
      getSessionLiveState={() => null}
      getWorktreeInfo={() => null}
      getSessionResumeState={vi.fn()}
      getSessionResumeActions={vi.fn()}
      getSessionResumeInChat={vi.fn()}
      onToggleGroup={vi.fn()}
      onJumpToOriginalPane={vi.fn()}
      onJumpToWorktree={vi.fn()}
      onResumeInNewCli={vi.fn()}
      onResume={vi.fn()}
      onContinueInNewSession={vi.fn()}
      onResumeInNewChat={vi.fn()}
      onCopyResume={vi.fn()}
      onCopyId={vi.fn()}
      onCopyPath={vi.fn()}
      onOpenLog={vi.fn()}
      onRevealLog={vi.fn()}
      onOpenCwd={vi.fn()}
      onRequestDelete={vi.fn()}
    />
  )
}

beforeEach(() => {
  sessionNameStore.reset()
  Object.assign(window, {
    api: { aiVault: { resolveSessionTitles: vi.fn(async () => ({ titles: [] })) } }
  })
})
afterEach(() => {
  cleanup()
  sessionNameStore.reset()
  vi.restoreAllMocks()
})

it('hands History rows the shared canonical name and follows a rename', () => {
  act(() =>
    sessionNameStore.publish('local', {
      titles: [
        {
          agent: 'codex',
          sessionId: 's1',
          title: 'Scanned prompt',
          providerName: { kind: 'named', title: 'Native name', field: 'session_index.thread_name' }
        }
      ]
    })
  )
  renderList()
  expect(screen.getByTestId(session.id).textContent).toBe('Native name')

  act(() =>
    sessionNameStore.publish('local', {
      titles: [
        {
          agent: 'codex',
          sessionId: 's1',
          title: 'Scanned prompt',
          providerName: { kind: 'named', title: 'Renamed', field: 'session_index.thread_name' }
        }
      ]
    })
  )
  expect(screen.getByTestId(session.id).textContent).toBe('Renamed')
})
