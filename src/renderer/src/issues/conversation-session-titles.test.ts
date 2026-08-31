// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'
import {
  collectConversationSessionTitleRequests,
  type ConversationSessionTitleSource,
  useConversationSessionTitles
} from './conversation-session-titles'
import { conversationSessionTitleKey } from './issue-conversation-presentation'

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }))

beforeEach(() => {
  mocks.resolve.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { resolveSessionTitles: mocks.resolve } }
  })
})

afterEach(cleanup)

describe('Conversation session titles', () => {
  it('keeps identities host-scoped and skips unsupported, unnamed identities', () => {
    const local = conversation('local', 'local', 'session-1')
    const remote = conversation('remote', 'ssh:build', 'session-1')
    const noIdentity = conversation('hidden', 'local', 'hidden')
    noIdentity.navigation!.providerSession = null
    const named = conversation('named', 'local', 'named')
    named.title = 'User supplied'
    const gemini = conversation('gemini', 'local', 'gemini', 'gemini')

    const requests = collectConversationSessionTitleRequests(
      [local, remote, noIdentity, named, gemini].map((item) => ({
        conversation: item,
        executionHostScope: item.executionHostId
      }))
    )

    expect(requests).toHaveLength(2)
    expect(requests.map((request) => request.executionHostId)).toEqual(['local', 'ssh:build'])
    expect(conversationSessionTitleKey(local)).not.toBe(conversationSessionTitleKey(remote))
  })

  it('resolves exact titles locally without a global cache', async () => {
    const item = conversation('codex', 'local', 'codex-session', 'codex')
    item.navigation!.providerSession!.transcriptPath = '/sessions/codex-session.jsonl'
    const source: ConversationSessionTitleSource = {
      conversation: item,
      executionHostScope: 'local'
    }
    const sources = [source]
    mocks.resolve.mockResolvedValue({
      titles: [{ agent: 'codex', sessionId: 'codex-session', title: 'Resolved title' }]
    })

    const view = renderHook(() => useConversationSessionTitles(sources))

    await waitFor(() =>
      expect(view.result.current.get(conversationSessionTitleKey(item)!)).toBe('Resolved title')
    )
    expect(mocks.resolve).toHaveBeenCalledWith({
      executionHostScope: 'local',
      requests: [
        {
          agent: 'codex',
          sessionId: 'codex-session',
          transcriptPath: '/sessions/codex-session.jsonl'
        }
      ]
    })
  })

  it('keeps resolved titles and skips re-resolving when sources are rebuilt unchanged', async () => {
    const item = conversation('codex', 'local', 'codex-session', 'codex')
    mocks.resolve.mockResolvedValue({
      titles: [{ agent: 'codex', sessionId: 'codex-session', title: 'Resolved title' }]
    })
    const view = renderHook(
      ({ sources }: { sources: ConversationSessionTitleSource[] }) =>
        useConversationSessionTitles(sources),
      {
        initialProps: {
          sources: [{ conversation: item, executionHostScope: 'local' as const }]
        }
      }
    )
    await waitFor(() =>
      expect(view.result.current.get(conversationSessionTitleKey(item)!)).toBe('Resolved title')
    )
    const resolvedTitles = view.result.current

    // Why: every store publish hands the hook a fresh sources array carrying the same identities.
    view.rerender({
      sources: [{ conversation: { ...item }, executionHostScope: 'local' as const }]
    })

    expect(view.result.current).toBe(resolvedTitles)
    expect(mocks.resolve).toHaveBeenCalledTimes(1)
  })

  it('groups by host and respects the native 64-request batch limit', async () => {
    const sources: ConversationSessionTitleSource[] = [
      ...Array.from({ length: 65 }, (_, index) => {
        const item = conversation(`local-${index}`, 'local', `session-${index}`, 'codex')
        return { conversation: item, executionHostScope: 'local' as const }
      }),
      {
        conversation: conversation('remote', 'ssh:build', 'remote-session', 'claude'),
        executionHostScope: 'ssh:build'
      }
    ]
    mocks.resolve.mockResolvedValue({ titles: [] })

    renderHook(() => useConversationSessionTitles(sources))

    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(3))
    const calls = mocks.resolve.mock.calls.map(([args]) => args)
    expect(calls.filter((args) => args.executionHostScope === 'local')).toHaveLength(2)
    expect(
      calls
        .filter((args) => args.executionHostScope === 'local')
        .map((args) => args.requests.length)
        .sort((left, right) => right - left)
    ).toEqual([64, 1])
    expect(calls.filter((args) => args.executionHostScope === 'ssh:build')).toHaveLength(1)
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
    title: null,
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: sessionId },
      resumeLocator: null
    }
  } as ConversationSummary
}
