import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import { resolveTerminalTabTitle } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { buildMirroredTerminalTabs } from '../runtime/web-session-tabs-sync/tab-projection/terminal-build'
import { withWorktreeTabEntry } from '../runtime/web-session-tabs-sync/snapshots/presentation-record-drafts'
import { sameTerminalTabs } from '../runtime/web-session-tabs-sync/snapshots/state-equality-tabs'
import { useAppStore } from '../store'
import { makeTab } from '../store/terminals/testing/terminal-tab.test-fixture'

const leafId = '11111111-1111-4111-8111-111111111111'
const oldSlot = {
  agent: 'claude' as const,
  sessionId: 'session-a',
  title: 'First conversation',
  providerName: { kind: 'named' as const, title: 'First conversation', field: 'ai-title.aiTitle' }
}

const cached = makeTab({
  id: 'web-terminal-tab',
  worktreeId: 'workspace',
  title: 'First conversation',
  defaultTitle: 'First conversation',
  generatedTitle: 'First task summary',
  aiVaultTitle: oldSlot,
  launchAgent: 'claude'
})

function visibleName(
  surface: Partial<Omit<RuntimeMobileSessionTerminalClientTab, 'status' | 'terminal'>>,
  previous = cached
) {
  const terminal: RuntimeMobileSessionTerminalClientTab = {
    type: 'terminal',
    id: `tab::${leafId}`,
    parentTabId: 'tab',
    leafId,
    title: 'Terminal',
    isActive: true,
    launchAgent: 'claude',
    status: 'pending-handle',
    terminal: null,
    ...surface
  }
  const [{ tab }] = buildMirroredTerminalTabs(
    {
      worktree: 'workspace',
      publicationEpoch: 'epoch',
      snapshotVersion: 2,
      activeGroupId: null,
      activeTabType: 'terminal',
      activeTabId: 'tab',
      tabs: [terminal]
    },
    'remote',
    new Map([[previous.id, previous]]),
    {},
    {},
    0,
    1
  )
  return resolveTerminalTabTitle(tab, true, tab.title)
}

describe('paired terminal name ownership across snapshots', () => {
  it('retires the previous name and task when the publisher explicitly clears its slot', () => {
    expect(visibleName({ resolvesSessionTitle: true, aiVaultTitle: null })).toBe('Terminal')
  })

  it('drops an unowned legacy task when a headless status first identifies its session', () => {
    expect(
      visibleName(
        {
          agentStatus: {
            paneKey: `tab:${leafId}`,
            state: 'working',
            agentType: 'claude',
            prompt: '',
            stateHistory: [],
            stateStartedAt: 2,
            updatedAt: 2,
            providerSession: { key: 'session_id', id: 'session-b' }
          }
        },
        { ...cached, aiVaultTitle: null }
      )
    ).toBe('Terminal')
  })

  it('drops a former name across an explicit boundary without a replacement ID', () => {
    expect(
      visibleName({
        agentStatus: {
          paneKey: `tab:${leafId}`,
          state: 'done',
          agentType: 'claude',
          prompt: '',
          stateHistory: [],
          stateStartedAt: 2,
          updatedAt: 2,
          sessionBoundary: true
        }
      })
    ).toBe('Terminal')
  })

  it('honors the host dropping a generated task while keeping the same session', () => {
    expect(
      visibleName({
        resolvesSessionTitle: true,
        aiVaultTitle: {
          agent: 'claude',
          sessionId: 'session-a',
          title: 'Claude session-',
          providerName: { kind: 'absent' }
        }
      })
    ).toBe('Claude session-')
  })

  it('updates the native name when a peer keeps its legacy title field unchanged', () => {
    const updated = {
      ...cached,
      aiVaultTitle: {
        ...oldSlot,
        providerName: { ...oldSlot.providerName, title: 'Renamed by provider' }
      }
    }
    const records = withWorktreeTabEntry(
      { ...useAppStore.getInitialState(), tabsByWorktree: { workspace: [cached] } },
      'tabsByWorktree',
      'workspace',
      [updated],
      sameTerminalTabs
    )
    expect(resolveTerminalTabTitle(records.workspace[0], true)).toBe('Renamed by provider')
  })

  it('does not reuse a former session after a headless peer reports a replacement', () => {
    const agentStatus = {
      paneKey: `tab:${leafId}`,
      state: 'working' as const,
      agentType: 'claude' as const,
      prompt: '',
      stateHistory: [],
      stateStartedAt: 1,
      updatedAt: 1,
      providerSession: { key: 'session_id' as const, id: 'session-b' }
    }
    expect(visibleName({ agentStatus })).toBe('Terminal')
    expect(
      visibleName({
        agentStatus,
        aiVaultTitle: oldSlot,
        resolvesSessionTitle: true,
        title: 'First conversation'
      })
    ).toBe('Terminal')
    expect(
      visibleName({
        agentStatus,
        aiVaultTitle: {
          ...oldSlot,
          sessionId: 'session-b',
          title: 'Next conversation',
          providerName: { ...oldSlot.providerName, title: 'Next conversation' }
        }
      })
    ).toBe('Next conversation')
    expect(
      visibleName({
        agentStatus: { ...agentStatus, providerSession: { key: 'session_id', id: 'session-a' } }
      })
    ).toBe('First conversation')
    expect(visibleName({})).toBe('First conversation')
  })
})
