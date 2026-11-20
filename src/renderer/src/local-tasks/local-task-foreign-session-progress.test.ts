import { describe, expect, it, vi } from 'vitest'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { RuntimeEnvironmentStatus } from '../../../shared/remote-runtime/host-status/runtime-host-status'
import type {
  LocalTaskSessionLink,
  LocalTaskSessionProgress
} from '../../../shared/local-tasks/local-task-link-types'
import {
  projectLocalTaskForeignSessionProgress,
  type LocalTaskForeignSessionProgressState
} from './local-task-foreign-session-progress'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

const SELF = '2db7ea0a-15f2-4acf-a37b-a9e078c4a6bb'
const SOURCE = 'd3ab9ac0-f5a4-49c5-a25f-2b1791e98e2d'
const LEAF = 'ceca0499-165a-4d36-91bb-d0f88f666610'
const PANE = `web-terminal-source-tab:${LEAF}`
const NOW = 5_000_000
const link: LocalTaskSessionLink = {
  id: 'task-library/session',
  taskId: 'task-library/task',
  hostId: 'runtime:mini',
  executionOrigin: { installationId: SOURCE, hostId: 'local', hostLabel: 'mini' },
  worktreeId: 'folder:source-folder',
  instanceId: null,
  surface: 'terminal',
  tabId: 'web-terminal-source-tab',
  paneKey: PANE,
  sessionId: null,
  providerSession: null,
  agent: 'codex',
  linkedVia: 'manual',
  openedAt: 1
}

function runtime(): RuntimeEnvironmentStatus {
  return {
    checkedAt: NOW,
    status: {
      runtimeId: 'source-runtime',
      rendererGraphEpoch: 1,
      graphStatus: 'ready',
      authoritativeWindowId: 1,
      liveTabCount: 1,
      liveLeafCount: 1,
      hostDescriptor: { installationId: SOURCE }
    }
  }
}

function row(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    paneKey: PANE,
    worktreeId: link.worktreeId ?? undefined,
    state: 'working',
    prompt: '',
    stateHistory: [],
    updatedAt: NOW,
    stateStartedAt: NOW - 1000,
    connectionId: 'mini',
    agentType: 'codex',
    lastAssistantMessage: 'Source progress',
    ...overrides
  }
}

function state(entry: AgentStatusEntry = row()): LocalTaskForeignSessionProgressState {
  return {
    settings: null,
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map([['mini', runtime()]]),
    sshStateByEnvironment: new Map(),
    sshConnectionStates: new Map(),
    agentStatusByPaneKey: acceptedAgentStatuses([[entry.paneKey, entry]]),
    unifiedTabsByWorktree: {},
    acknowledgedAgentsByPaneKey: {}
  }
}

function previous(): LocalTaskSessionProgress {
  return {
    taskSessionId: link.id,
    state: 'working',
    lastMessage: 'Last confirmed prose',
    stateSince: 1,
    unread: false
  }
}

describe('foreign source progress projection', () => {
  it('reads the source mirror rather than a same-named task-owner local hook', () => {
    const app = state()
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [
        `source-tab:${LEAF}`,
        row({
          paneKey: `source-tab:${LEAF}`,
          connectionId: null,
          state: 'done',
          lastAssistantMessage: 'Wrong local process'
        })
      ]
    ])
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })).toMatchObject({
      taskSessionId: link.id,
      state: 'working',
      lastMessage: 'Source progress',
      unread: false
    })
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [PANE, row({ connectionId: 'other-environment' })]
    ])
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })).toMatchObject({
      state: 'unknown'
    })
  })

  it('uses the source tab owner when a mirrored hook has no connection stamp', () => {
    const app = state(row({ connectionId: null }))
    app.unifiedTabsByWorktree[link.worktreeId!] = [
      {
        id: link.tabId!,
        entityId: link.tabId!,
        worktreeId: link.worktreeId!,
        groupId: 'source-group',
        executionHostId: 'runtime:mini',
        contentType: 'terminal',
        label: 'Source',
        customLabel: null,
        color: null,
        sortOrder: 0,
        createdAt: 0
      }
    ]
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'working'
    )
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [PANE, row({ connectionId: 'other-environment' })]
    ])
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'unknown'
    )
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [PANE, row({ connectionId: null })]
    ])
    app.unifiedTabsByWorktree[link.worktreeId!][0].executionHostId = 'runtime:other'
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'unknown'
    )
  })

  it('marks lost contact unverifiable without consuming stale/new hook text or proving exit', () => {
    const app = state(row({ state: 'done', lastAssistantMessage: 'Not a contacted source' }))
    const entry = app.runtimeStatusByEnvironmentId.get('mini')!
    entry.snapshot = {
      environmentId: 'mini',
      pairingRevision: 1,
      sequence: 1,
      checkedAt: NOW,
      status: entry.status,
      verification: 'unavailable',
      transport: 'disconnected'
    }
    entry.status = null
    expect(
      projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW, previous: previous() })
    ).toEqual({
      taskSessionId: link.id,
      state: 'unverifiable',
      lastMessage: 'Last confirmed prose',
      stateSince: null,
      unread: false
    })
    app.runtimeStatusByEnvironmentId = new Map()
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'unverifiable'
    )
  })

  it('keeps silent live waits, decays unknown liveness conservatively and uses replica-local evidence time', () => {
    const old = NOW - 3_600_000
    const app = state(row({ state: 'waiting', updatedAt: old }))
    expect(
      projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW, terminalLive: true })
        ?.state
    ).toBe('waiting')
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'unverifiable'
    )
    expect(
      projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW, terminalLive: false })
        ?.state
    ).toBe('idle')
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [
        PANE,
        row({
          updatedAt: old,
          evidenceObservedAt: old,
          mirroredEvidenceReceivedAt: NOW
        })
      ]
    ])
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.state).toBe(
      'working'
    )
  })

  it('retains prose across tool output and clears completion unread only with source acknowledgement', () => {
    const app = state(
      row({
        state: 'done',
        lastAssistantMessage: 'compiler output',
        lastAssistantMessageIsToolOutput: true
      })
    )
    expect(
      projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW, previous: previous() })
    ).toMatchObject({
      state: 'done',
      lastMessage: 'Last confirmed prose',
      unread: true
    })
    app.acknowledgedAgentsByPaneKey[PANE] = NOW
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.unread).toBe(
      false
    )
    app.agentStatusByPaneKey = acceptedAgentStatuses([
      ...app.agentStatusByPaneKey,
      [PANE, row({ state: 'done', sessionBoundary: true })]
    ])
    expect(projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW })?.unread).toBe(
      false
    )
  })

  it('requires contact with the owning nested SSH target and never substitutes a client SSH target', () => {
    const app = state()
    const nestedLink = {
      ...link,
      executionOrigin: { ...link.executionOrigin!, hostId: 'ssh:builder' }
    }
    expect(projectLocalTaskForeignSessionProgress(app, SELF, nestedLink, { now: NOW })?.state).toBe(
      'unverifiable'
    )
    app.sshStateByEnvironment.set('mini', {
      targetsHydrated: true,
      targetLabels: new Map(),
      removedTargetLabels: new Map(),
      targetGenerations: new Map(),
      connectionStates: new Map([
        ['builder', { targetId: 'builder', status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })
    expect(projectLocalTaskForeignSessionProgress(app, SELF, nestedLink, { now: NOW })?.state).toBe(
      'working'
    )
    app.sshStateByEnvironment.clear()
    app.sshConnectionStates.set('builder', {
      targetId: 'builder',
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    expect(projectLocalTaskForeignSessionProgress(app, SELF, nestedLink, { now: NOW })?.state).toBe(
      'unverifiable'
    )
  })

  it('does not turn disappearance or an ordinary library link into foreign exit evidence', () => {
    const app = state()
    app.agentStatusByPaneKey = acceptedAgentStatuses()
    expect(
      projectLocalTaskForeignSessionProgress(app, SELF, link, { now: NOW, previous: previous() })
    ).toMatchObject({
      state: 'unknown',
      lastMessage: 'Last confirmed prose'
    })
    const { executionOrigin: _, ...ordinary } = link
    expect(projectLocalTaskForeignSessionProgress(app, SELF, ordinary, { now: NOW })).toBeNull()
  })
})
