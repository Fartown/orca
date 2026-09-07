import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../shared/ai-vault-types'

const resolveInBackground = vi.fn()
const listSessions = vi.fn()

vi.mock('./session-scanner-background', () => ({
  resolveAiVaultSessionTitlesInBackground: (...args: unknown[]) => resolveInBackground(...args)
}))
vi.mock('./cached-session-list', () => ({
  listAiVaultSessions: (...args: unknown[]) => listSessions(...args)
}))

const { resolveLocalAiVaultSessionTitles } = await import('./session-title-resolver')

function scannedSession(
  agent: 'claude' | 'codex',
  sessionId: string,
  title: string
): AiVaultSession {
  return {
    id: `local:${agent}:${sessionId}`,
    executionHostId: 'local',
    agent,
    sessionId,
    title,
    cwd: null,
    branch: null,
    model: null,
    filePath: `/vault/${sessionId}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-06T00:00:00.000Z',
    messageCount: 1
  } as AiVaultSession
}

describe('resolveLocalAiVaultSessionTitles', () => {
  beforeEach(() => {
    resolveInBackground.mockReset()
    listSessions.mockReset()
  })

  it('does not scan when the path read already answered every request', async () => {
    resolveInBackground.mockResolvedValue({
      titles: [{ agent: 'claude', sessionId: 'live', title: 'Named by path' }]
    })
    const result = await resolveLocalAiVaultSessionTitles([
      { agent: 'claude', sessionId: 'live', transcriptPath: '/vault/live.jsonl' }
    ])
    expect(result.titles).toEqual([{ agent: 'claude', sessionId: 'live', title: 'Named by path' }])
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('recovers a title when the recorded transcript path is stale', async () => {
    resolveInBackground.mockResolvedValue({ titles: [] })
    listSessions.mockResolvedValue({
      sessions: [scannedSession('claude', 'rotated', 'Investigate tab titles')]
    })
    const result = await resolveLocalAiVaultSessionTitles([
      { agent: 'claude', sessionId: 'rotated', transcriptPath: '/vault/deleted.jsonl' }
    ])
    expect(result.titles).toEqual([
      { agent: 'claude', sessionId: 'rotated', title: 'Investigate tab titles' }
    ])
  })

  it('recovers a title when the identity carries no transcript path at all', async () => {
    resolveInBackground.mockResolvedValue({ titles: [] })
    listSessions.mockResolvedValue({
      sessions: [scannedSession('codex', 'no-path', '清理 worktree')]
    })
    const result = await resolveLocalAiVaultSessionTitles([
      { agent: 'codex', sessionId: 'no-path' }
    ])
    expect(result.titles).toEqual([
      { agent: 'codex', sessionId: 'no-path', title: '清理 worktree' }
    ])
  })

  it('keeps path-read titles and only fills the gaps', async () => {
    resolveInBackground.mockResolvedValue({
      titles: [{ agent: 'claude', sessionId: 'ok', title: 'From path' }]
    })
    listSessions.mockResolvedValue({
      sessions: [
        scannedSession('claude', 'ok', 'Scan would say otherwise'),
        scannedSession('codex', 'gap', 'From scan')
      ]
    })
    const result = await resolveLocalAiVaultSessionTitles([
      { agent: 'claude', sessionId: 'ok', transcriptPath: '/vault/ok.jsonl' },
      { agent: 'codex', sessionId: 'gap' }
    ])
    expect(result.titles).toEqual([
      { agent: 'claude', sessionId: 'ok', title: 'From path' },
      { agent: 'codex', sessionId: 'gap', title: 'From scan' }
    ])
  })

  it('degrades to the path read when the scan is unavailable', async () => {
    resolveInBackground.mockResolvedValue({ titles: [] })
    listSessions.mockRejectedValue(new Error('scanner offline'))
    await expect(
      resolveLocalAiVaultSessionTitles([{ agent: 'codex', sessionId: 'gone' }])
    ).resolves.toEqual({ titles: [] })
  })

  it('leaves sessions the scan does not know about unnamed', async () => {
    resolveInBackground.mockResolvedValue({ titles: [] })
    listSessions.mockResolvedValue({ sessions: [scannedSession('claude', 'other', 'Unrelated')] })
    const result = await resolveLocalAiVaultSessionTitles([{ agent: 'codex', sessionId: 'gone' }])
    expect(result.titles).toEqual([])
  })

  it('does not scan once the caller aborted', async () => {
    resolveInBackground.mockResolvedValue({ titles: [] })
    const controller = new AbortController()
    controller.abort()
    await resolveLocalAiVaultSessionTitles(
      [{ agent: 'codex', sessionId: 'gone' }],
      controller.signal
    )
    expect(listSessions).not.toHaveBeenCalled()
  })
})
