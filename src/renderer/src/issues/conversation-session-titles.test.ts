import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSessionTitlesArgs } from '../../../shared/ai-vault-session-title'
import type { ConversationSummary } from '../../../shared/issues/types'
import {
  collectConversationSessionTitleRequests,
  resolveConversationSessionTitleChanges,
  resolveConversationSessionTitles,
  type ConversationSessionTitleResolution,
  type ConversationSessionTitleSource
} from './conversation-session-titles'
import { conversationSessionTitleKey } from './issue-conversation-presentation'
import { MISSING_AI_VAULT_TITLE_REFRESH_MS } from '@/lib/ai-vault-tab-title-sync'

describe('Conversation session titles', () => {
  it('batches by host and keeps equal provider ids isolated across hosts', async () => {
    const conversations = [
      ...Array.from({ length: 65 }, (_, index) =>
        conversation(`local-${index}`, 'local', `session-${index}`)
      ),
      conversation('remote', 'ssh:build', 'session-0'),
      conversation('paired', 'local', 'session-0')
    ]
    const sources = conversations.map(
      (item, index): ConversationSessionTitleSource => ({
        conversation: item,
        executionHostScope:
          index === conversations.length - 1 ? 'runtime:paired' : item.executionHostId
      })
    )
    const requests = collectConversationSessionTitleRequests(sources)
    const resolveSessionTitles = vi.fn(async (args: AiVaultSessionTitlesArgs) => ({
      titles: requests
        .filter((request) => request.executionHostId === args.executionHostScope)
        .filter((request) =>
          args.requests.some(
            (candidate) =>
              candidate.agent === request.agent &&
              candidate.sessionId === request.providerSession.id
          )
        )
        .map((request) => ({
          agent: request.agent,
          sessionId: request.providerSession.id,
          title: `${args.executionHostScope}:${request.providerSession.id}`
        }))
    }))

    const titles = await resolveConversationSessionTitles(requests, resolveSessionTitles)

    expect(resolveSessionTitles).toHaveBeenCalledTimes(4)
    expect(
      resolveSessionTitles.mock.calls.map(([args]) => args.requests.length).sort((a, b) => a - b)
    ).toEqual([1, 1, 1, 64])
    expect(titles.get(conversationSessionTitleKey(conversations[0]!)!)).toBe('local:session-0')
    expect(titles.get(conversationSessionTitleKey(conversations.at(-2)!)!)).toBe(
      'ssh:build:session-0'
    )
    expect(titles.get(conversationSessionTitleKey(conversations.at(-1)!, 'runtime:paired')!)).toBe(
      'runtime:paired:session-0'
    )
  })

  it('keeps resolving other hosts when one host is unavailable', async () => {
    const local = conversation('local', 'local', 'local-session')
    const remote = conversation('remote', 'ssh:build', 'remote-session')
    const titles = await resolveConversationSessionTitles(
      collectConversationSessionTitleRequests([
        { conversation: local, executionHostScope: 'local' },
        { conversation: remote, executionHostScope: 'ssh:build' }
      ]),
      async (args) => {
        if (args.executionHostScope === 'local') {
          throw new Error('local scanner unavailable')
        }
        return { titles: [{ agent: 'claude', sessionId: 'remote-session', title: 'Remote title' }] }
      }
    )

    expect(titles.has(conversationSessionTitleKey(local)!)).toBe(false)
    expect(titles.get(conversationSessionTitleKey(remote)!)).toBe('Remote title')
  })

  it('uses the native title agents only and records a resolved identity with no title', async () => {
    const claude = conversation('claude', 'ssh:build', 'claude-session')
    const gemini = conversation('gemini', 'ssh:build', 'gemini-session', 'gemini')
    const codex = conversation('codex', 'ssh:build', 'codex-session', 'codex')
    const requests = collectConversationSessionTitleRequests([
      { conversation: claude, executionHostScope: 'ssh:build' },
      { conversation: gemini, executionHostScope: 'ssh:build' },
      { conversation: codex, executionHostScope: 'ssh:build' }
    ])
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [{ agent: 'claude' as const, sessionId: 'claude-session', title: 'Claude title' }]
    }))

    const titles = await resolveConversationSessionTitles(requests, resolveSessionTitles)

    expect(resolveSessionTitles).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(2)
    expect(titles.get(conversationSessionTitleKey(claude)!)).toBe('Claude title')
    expect(titles.get(conversationSessionTitleKey(codex)!)).toBe('')
    expect(titles.has(conversationSessionTitleKey(gemini)!)).toBe(false)
  })

  it('does not resolve a native title when the Conversation already has an explicit name', () => {
    const named = conversation('named', 'local', 'named-session')
    named.title = 'User supplied name'

    expect(
      collectConversationSessionTitleRequests([
        { conversation: named, executionHostScope: 'local' }
      ])
    ).toEqual([])
  })

  it('does not re-resolve stable identities but refreshes when their transcript path changes', async () => {
    const item = conversation('codex', 'local', 'codex-session', 'codex')
    const resolutions = new Map<string, ConversationSessionTitleResolution>()
    const resolveSessionTitles = vi.fn(async (args: AiVaultSessionTitlesArgs) => ({
      titles: args.requests.map((request) => ({
        agent: request.agent,
        sessionId: request.sessionId,
        title: 'Stable title'
      }))
    }))
    const requests = () =>
      collectConversationSessionTitleRequests([{ conversation: item, executionHostScope: 'local' }])

    const first = await resolveConversationSessionTitleChanges(
      requests(),
      resolutions,
      resolveSessionTitles,
      1_000
    )
    expect(first.titles).toEqual(new Map([[conversationSessionTitleKey(item)!, 'Stable title']]))
    for (const [key, resolution] of first.resolutions) {
      resolutions.set(key, resolution)
    }
    await expect(
      resolveConversationSessionTitleChanges(requests(), resolutions, resolveSessionTitles, 1_001)
    ).resolves.toEqual({ titles: new Map(), resolutions: new Map() })
    item.navigation!.providerSession!.transcriptPath = '/new/path.jsonl'
    await resolveConversationSessionTitleChanges(
      requests(),
      resolutions,
      resolveSessionTitles,
      1_002
    )

    expect(resolveSessionTitles).toHaveBeenCalledTimes(2)
  })

  it('reuses the native missing-title backoff before trying an empty title again', async () => {
    const item = conversation('codex', 'local', 'codex-session', 'codex')
    const resolutions = new Map<string, ConversationSessionTitleResolution>()
    const resolveSessionTitles = vi.fn(async () => ({ titles: [] }))
    const requests = collectConversationSessionTitleRequests([
      { conversation: item, executionHostScope: 'local' }
    ])
    const first = await resolveConversationSessionTitleChanges(
      requests,
      resolutions,
      resolveSessionTitles,
      1_000
    )
    for (const [key, resolution] of first.resolutions) {
      resolutions.set(key, resolution)
    }

    await resolveConversationSessionTitleChanges(
      requests,
      resolutions,
      resolveSessionTitles,
      1_000 + MISSING_AI_VAULT_TITLE_REFRESH_MS - 1
    )
    await resolveConversationSessionTitleChanges(
      requests,
      resolutions,
      resolveSessionTitles,
      1_000 + MISSING_AI_VAULT_TITLE_REFRESH_MS
    )

    expect(resolveSessionTitles).toHaveBeenCalledTimes(2)
  })
})

function conversation(
  id: string,
  executionHostId: ConversationSummary['executionHostId'],
  sessionId: string,
  agent: ConversationSummary['agent'] = 'claude'
): ConversationSummary {
  return {
    id,
    executionHostId,
    agent,
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: sessionId },
      resumeLocator: null
    }
  } as ConversationSummary
}
