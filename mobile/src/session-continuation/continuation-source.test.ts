import { describe, expect, it } from 'vitest'
import { resolveMobileContinuationSource, type MobileContinuationTab } from './continuation-source'

function tab(overrides: Partial<MobileContinuationTab> = {}): MobileContinuationTab {
  return {
    type: 'terminal',
    title: 'Add auth',
    launchAgent: 'claude',
    startupCwd: '/srv/app/packages/api',
    agentStatus: {
      state: 'idle',
      prompt: 'keep going',
      agentType: 'claude',
      lastAssistantMessage: 'tests pass',
      providerSession: { id: 'sess-1', transcriptPath: '/home/dev/.claude/a.jsonl' }
    } as MobileContinuationTab['agentStatus'],
    ...overrides
  }
}

describe('mobile continuation source', () => {
  it('builds the source from the tab the desktop reads the same fields off', () => {
    const result = resolveMobileContinuationSource(tab())

    expect(result).toEqual({
      eligible: true,
      sourceAgent: 'claude',
      source: {
        sourceAgent: 'claude',
        capturedText: '',
        sourceTitle: 'Add auth',
        sourceWorkingDirectory: '/srv/app/packages/api',
        transcriptPath: '/home/dev/.claude/a.jsonl',
        lastPrompt: 'keep going',
        lastAssistantMessage: 'tests pass'
      }
    })
  })

  it('falls back to the launch hint only when no live agent was reported', () => {
    const withoutLiveAgent = resolveMobileContinuationSource(
      tab({
        agentStatus: {
          state: 'idle',
          prompt: '',
          providerSession: { id: 's', transcriptPath: '/t.jsonl' }
        } as MobileContinuationTab['agentStatus']
      })
    )

    expect(withoutLiveAgent.eligible).toBe(true)
  })

  it('refuses a live agent outside the allowed set instead of trusting the launch hint', () => {
    const result = resolveMobileContinuationSource(
      tab({
        launchAgent: 'claude',
        agentStatus: {
          state: 'idle',
          prompt: '',
          agentType: 'aider',
          providerSession: { id: 's', transcriptPath: '/t.jsonl' }
        } as MobileContinuationTab['agentStatus']
      })
    )

    expect(result).toEqual({ eligible: false, reason: 'unsupported-agent' })
  })

  it('refuses agents outside phase one', () => {
    expect(
      resolveMobileContinuationSource(tab({ launchAgent: 'goose', agentStatus: null }))
    ).toEqual({ eligible: false, reason: 'unsupported-agent' })
  })

  it('refuses a session with no transcript path, since mobile has no scrollback fallback', () => {
    const blank = resolveMobileContinuationSource(
      tab({
        agentStatus: {
          state: 'idle',
          prompt: '',
          agentType: 'codex',
          providerSession: { id: 's', transcriptPath: '   ' }
        } as MobileContinuationTab['agentStatus']
      })
    )
    const missing = resolveMobileContinuationSource(
      tab({
        agentStatus: {
          state: 'idle',
          prompt: '',
          agentType: 'codex'
        } as MobileContinuationTab['agentStatus']
      })
    )

    expect(blank).toEqual({ eligible: false, reason: 'no-transcript' })
    expect(missing).toEqual({ eligible: false, reason: 'no-transcript' })
  })

  it('refuses non-terminal tabs and a missing tab', () => {
    expect(resolveMobileContinuationSource(tab({ type: 'agent-session' })).eligible).toBe(false)
    expect(resolveMobileContinuationSource(null).eligible).toBe(false)
  })

  it('omits optional source fields the tab does not carry', () => {
    const result = resolveMobileContinuationSource(tab({ title: '   ', startupCwd: undefined }))

    expect(result.eligible).toBe(true)
    if (result.eligible) {
      expect(result.source.sourceTitle).toBeUndefined()
      expect(result.source.sourceWorkingDirectory).toBeUndefined()
    }
  })
})
