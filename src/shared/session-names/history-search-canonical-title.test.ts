import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../ai-vault/contracts/ai-vault-types'
import {
  filterAiVaultSessions,
  type AiVaultSessionFilterState
} from '../ai-vault/session-display/ai-vault-session-filters'

const baseSession: AiVaultSession = {
  id: 'claude:1',
  executionHostId: 'local',
  agent: 'claude',
  sessionId: 'session-1',
  title: 'Implement vault filters',
  cwd: '/Users/ada/repo/app',
  branch: 'feature/vault',
  model: 'claude-sonnet-4-5',
  filePath: '/Users/ada/.claude/projects/session-1.jsonl',
  codexHome: null,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:10:00.000Z',
  modifiedAt: '2026-05-01T10:10:00.000Z',
  messageCount: 4,
  totalTokens: 1200,
  previewMessages: [{ role: 'user', text: 'add the scope tabs', timestamp: null }],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: "cd '/Users/ada/repo/app' && claude --resume 'session-1'",
  subagent: null
}

const otherSession: AiVaultSession = {
  ...baseSession,
  id: 'codex:2',
  agent: 'codex',
  sessionId: 'session-2',
  title: 'Repair terminal tabs',
  filePath: '/Users/ada/.codex/sessions/session-2.jsonl',
  previewMessages: []
}

function filterIds(
  query: string,
  canonicalTitleBySessionKey?: AiVaultSessionFilterState['canonicalTitleBySessionKey']
): string[] {
  return filterAiVaultSessions([baseSession, otherSession], {
    query,
    agents: ['claude', 'codex'],
    scope: 'all',
    sort: 'updated',
    activeWorktreePaths: [],
    canonicalTitleBySessionKey,
    hideEmptySessions: false
  }).map((session) => session.id)
}

describe('canonical title search', () => {
  it('matches sessions by their canonical conversation title', () => {
    const canonicalTitleBySessionKey = new Map([
      ['local\0claude\0session-1', 'My renamed conversation']
    ])
    expect(filterIds('renamed', canonicalTitleBySessionKey)).toEqual(['claude:1'])
    // The scanner title keeps matching too.
    expect(filterIds('Implement vault', canonicalTitleBySessionKey)).toEqual(['claude:1'])
  })

  it('follows a rename of the same session object', () => {
    expect(filterIds('renamed')).toEqual([])
    expect(filterIds('renamed', new Map([['local\0claude\0session-1', 'Renamed later']]))).toEqual([
      'claude:1'
    ])
  })
})
