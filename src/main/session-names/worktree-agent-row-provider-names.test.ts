import { describe, expect, it, vi } from 'vitest'
import { getAgentRowConversationName } from '../../shared/agent-status/presentation/agent-row-conversation-name'
import type { RuntimeWorktreeAgentSource } from '../runtime/workspaces/process-listing/runtime-worktree-agent-source'
import {
  mergeWorktreeAgentRowProviderTitle,
  resolveWorktreeAgentRowProviderNames,
  worktreeAgentRowProviderTitleKey
} from './worktree-agent-row-provider-names'

function makeSource(
  overrides: Partial<RuntimeWorktreeAgentSource> = {}
): RuntimeWorktreeAgentSource {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    connectionId: null,
    state: 'working',
    agentType: 'claude',
    providerSessionId: 'session-1',
    prompt: '你觉得呢',
    lastAssistantMessage: null,
    toolName: null,
    toolInput: null,
    interrupted: false,
    stateStartedAt: 1_000,
    updatedAt: 1_000,
    transcriptPath: '/tmp/home/.claude/projects/repo/session-1.jsonl',
    ...overrides
  }
}

describe('worktree-agent-row-provider-names', () => {
  it('resolves host-local provider native names and skips remote connection rows', async () => {
    const resolveTitles = vi.fn(
      async (
        _requests: readonly { agent: string; sessionId: string; transcriptPath?: string }[]
      ) => ({
        titles: [
          {
            agent: 'claude' as const,
            sessionId: 'session-1',
            title: '远端原生会话名',
            kind: 'named' as const,
            providerName: {
              kind: 'named' as const,
              title: '远端原生会话名',
              field: 'custom-title.customTitle'
            }
          }
        ]
      })
    )
    const sources = new Map<string, RuntimeWorktreeAgentSource>([
      ['local-pane', makeSource()],
      [
        'ssh-pane',
        makeSource({
          paneKey: 'tab-2:22222222-2222-4222-8222-222222222222',
          connectionId: 'ssh:box',
          providerSessionId: 'remote-only-session'
        })
      ]
    ])

    const resolved = await resolveWorktreeAgentRowProviderNames(sources, { resolveTitles })

    expect(resolveTitles).toHaveBeenCalledTimes(1)
    expect(resolveTitles.mock.calls[0]?.[0]).toEqual([
      {
        agent: 'claude',
        sessionId: 'session-1',
        transcriptPath: '/tmp/home/.claude/projects/repo/session-1.jsonl'
      }
    ])
    const slot = resolved.get(worktreeAgentRowProviderTitleKey('claude', 'session-1'))
    expect(slot?.providerName).toMatchObject({ kind: 'named', title: '远端原生会话名' })
    expect(resolved.has(worktreeAgentRowProviderTitleKey('claude', 'remote-only-session'))).toBe(
      false
    )
  })

  it('provides provider name when headless tab lacks aiVaultTitle while keeping manual rename first', async () => {
    const resolved = await resolveWorktreeAgentRowProviderNames(new Map([['p1', makeSource()]]), {
      resolveTitles: async () => ({
        titles: [
          {
            agent: 'claude',
            sessionId: 'session-1',
            title: '远端原生会话名',
            kind: 'named',
            providerName: {
              kind: 'named',
              title: '远端原生会话名',
              field: 'custom-title.customTitle'
            }
          }
        ]
      })
    })

    const source = { agentType: 'claude', providerSessionId: 'session-1' }
    const headlessTab = mergeWorktreeAgentRowProviderTitle(
      { title: 'Terminal', customTitle: null },
      source,
      resolved
    )
    expect(
      getAgentRowConversationName(headlessTab!, 'claude', true, undefined, {
        providerSessionId: 'session-1'
      })
    ).toBe('远端原生会话名')

    const missingTab = mergeWorktreeAgentRowProviderTitle(null, source, resolved)
    expect(
      getAgentRowConversationName(missingTab!, 'claude', true, undefined, {
        providerSessionId: 'session-1'
      })
    ).toBe('远端原生会话名')

    const manualTab = mergeWorktreeAgentRowProviderTitle(
      { title: 'Terminal', customTitle: '手动改名' },
      source,
      resolved
    )
    expect(
      getAgentRowConversationName(manualTab!, 'claude', true, undefined, {
        providerSessionId: 'session-1'
      })
    ).toBe('手动改名')

    const remoteTab = mergeWorktreeAgentRowProviderTitle(
      { title: 'Terminal', customTitle: null },
      { ...source, connectionId: 'ssh:box' },
      resolved
    )
    expect(remoteTab?.aiVaultTitle).toBeUndefined()
  })

  it('swallows resolver errors so worktree.ps never fails when vault is unavailable', async () => {
    const resolved = await resolveWorktreeAgentRowProviderNames(new Map([['p1', makeSource()]]), {
      resolveTitles: async () => {
        throw new Error('scanner unavailable')
      }
    })
    expect(resolved.size).toBe(0)
  })
})
