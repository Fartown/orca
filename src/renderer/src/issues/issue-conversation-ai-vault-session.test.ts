import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'
import { toIssueConversationAiVaultSessionReference } from './issue-conversation-ai-vault-session'

describe('toIssueConversationAiVaultSessionReference', () => {
  it('is only a persistence-to-native-session mapping', () => {
    expect(toIssueConversationAiVaultSessionReference(conversation(), 'ssh:build')).toEqual({
      agent: 'codex',
      sessionId: 'session-1',
      providerSessionKey: 'session_id',
      executionHostId: 'ssh:build'
    })
  })

  it('does not invent a resumable identity when persistence has none', () => {
    expect(
      toIssueConversationAiVaultSessionReference(
        conversation({ navigation: { paneKey: null, providerSession: null, resumeLocator: null } }),
        'local'
      )
    ).toBeNull()
  })
})

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation-1',
    agent: 'codex',
    title: 'Named Conversation',
    latestRound: { userInput: { text: ' latest prompt ' } },
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: 'session-1' },
      resumeLocator: null
    },
    ...overrides
  } as ConversationSummary
}
