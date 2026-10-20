import { describe, expect, it } from 'vitest'
import {
  launchCandidateEvidence,
  launchEvidence,
  launchReference,
  providerReference
} from './launch-evidence'

describe('terminal launch diagnostic allowlist', () => {
  it('records the orphaned-live-checkpoint boundary without calling it exited', () => {
    const leaf = 'a42a93b4-4ad2-45b3-afbb-fc89ad64787e'
    const input = {
      paneKey: `old:${leaf}`,
      worktreeId: 'wt',
      agent: 'codex',
      providerSession: { id: 'same' }
    }
    const state = {
      tabsByWorktree: { wt: [] },
      ptyIdsByTabId: {},
      terminalLayoutsByTabId: { old: { ptyIdsByLeafId: { [leaf]: 'live-host-pty' } } }
    }
    expect(launchCandidateEvidence(input, state)).toMatchObject({
      sourcePaneHasTab: false,
      sourcePaneHasRendererPty: false,
      sourcePaneHasPersistedBinding: true
    })
  })
  it('correlates mirror/host identities without copying private values', () => {
    const providerSession = { id: 'private-session', transcriptPath: '/private/session.jsonl' }
    const input = {
      worktreeId: '/private/repo',
      tabId: 'tab',
      leafId: 'leaf',
      agent: 'codex',
      providerSession,
      command: 'private-command',
      prompt: 'private-prompt',
      env: { API_KEY: 'private-secret' },
      title: 'private-title'
    }
    const result = launchEvidence(input)
    expect(result.tabRef).toBe(launchEvidence({ tabId: 'web-terminal-tab' }).tabRef)
    expect(result.providerRef).toBe(providerReference('codex', providerSession))
    expect(result.providerRef).not.toBe(providerReference('claude', providerSession))
    expect(result.hasCommand).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/private-|API_KEY/)
    expect(launchReference('x'.repeat(8193))).toBeNull()
  })

  it('distinguishes renderer observations from authoritative process liveness', () => {
    const input = { agent: 'codex', providerSession: { id: 'same' } }
    const state = {
      agentStatusByPaneKey: {
        one: {
          paneKey: 'tab:leaf',
          tabId: 'tab',
          agentType: 'codex',
          providerSession: { id: 'same' },
          state: 'working'
        }
      },
      ptyIdsByTabId: {}
    }
    expect(launchCandidateEvidence(input, state)).toMatchObject({
      candidateCount: 1,
      candidate0HasLivePty: false,
      candidate0State: 'working'
    })
    expect(
      launchCandidateEvidence(input, { ...state, ptyIdsByTabId: { tab: ['pty'] } })
    ).toMatchObject({ candidate0HasLivePty: true })
  })

  it('makes candidate truncation explicit and never logs arbitrary status text', () => {
    const statuses = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        i,
        { agentType: 'codex', providerSession: { id: 'same' }, state: 'private-message' }
      ])
    )
    const result = launchCandidateEvidence(
      { agent: 'codex', providerSession: { id: 'same' } },
      { agentStatusByPaneKey: statuses }
    )
    expect(result).toMatchObject({
      candidateCount: 12,
      candidatesOmitted: 4,
      candidate7State: 'unknown'
    })
    expect(result.candidate8State).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('private-message')
  })
})
