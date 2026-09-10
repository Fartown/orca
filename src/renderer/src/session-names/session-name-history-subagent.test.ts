import { afterEach, expect, it } from 'vitest'
import { getScannedSessionDisplayName } from './session-name-display'
import { sessionNameStore } from './session-name-store'
import { scannedSession } from './scanned-session-name-test-fixture'

afterEach(() => sessionNameStore.reset())

it('does not borrow a parent cached name for a child transcript sharing its session ID', () => {
  const parent = scannedSession({
    providerName: { kind: 'named', title: 'Parent native name', field: 'custom-title' }
  })
  sessionNameStore.seed([parent])
  const child = scannedSession({
    id: 'child-row',
    filePath: '/fixture/transcripts/agent-child.jsonl',
    generatedTitle: 'Review the child implementation',
    subagent: { parentSessionId: parent.sessionId, agentType: 'reviewer', status: 'completed' }
  })
  expect(getScannedSessionDisplayName(child, 'Parent manual name')).toBe(
    'Review the child implementation'
  )
  expect(getScannedSessionDisplayName(parent)).toBe('Parent native name')
})

it('never seeds a child transcript into its parent public cache slot', () => {
  const child = scannedSession({
    providerName: { kind: 'named', title: 'Child native name', field: 'agent-name' },
    subagent: { parentSessionId: 'session-A', agentType: 'reviewer', status: 'completed' }
  })
  sessionNameStore.seed([child])
  expect(sessionNameStore.getSnapshot().size).toBe(0)
  expect(getScannedSessionDisplayName(child)).toBe('Child native name')
})

it('keeps independent child IDs separate from their parent and other execution hosts', () => {
  const child = scannedSession({
    sessionId: 'child-session',
    providerName: { kind: 'named', title: 'Independent child name', field: 'agent-name' },
    subagent: { parentSessionId: 'session-A', agentType: 'reviewer', status: 'completed' }
  })
  const remote = {
    ...child,
    executionHostId: 'ssh:other' as const,
    providerName: { kind: 'absent' as const }
  }
  sessionNameStore.seed([child])
  expect(getScannedSessionDisplayName(child)).toBe('Independent child name')
  expect(getScannedSessionDisplayName(remote)).toBe('Fix the session title')
  expect(getScannedSessionDisplayName(scannedSession())).toBe('Fix the session title')
})
