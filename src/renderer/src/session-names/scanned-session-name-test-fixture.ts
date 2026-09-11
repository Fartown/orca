import type { AiVaultSession } from '../../../shared/ai-vault-types'

export function scannedSession(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'row-A',
    executionHostId: 'local',
    agent: 'claude',
    sessionId: 'session-A',
    title: 'Old scanner title',
    providerName: { kind: 'absent' },
    generatedTitle: 'Fix the session title',
    cwd: '/fixture/workspace',
    branch: null,
    model: null,
    filePath: '/fixture/transcripts/session-A.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-09T00:00:00Z',
    messageCount: 2,
    totalTokens: 0,
    lastUserPrompt: 'Continue with the regression tests',
    previewMessages: [{ role: 'assistant', text: 'Tests need work.', timestamp: null }],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'claude --resume session-A',
    subagent: null,
    ...overrides
  }
}
