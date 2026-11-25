import { describe, expect, it } from 'vitest'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/worktree/catalog/runtime-worktree-contracts'
import {
  agentDisplayForkedLead,
  agentDisplayLabel
} from '../worktree/agent-lineage/agent-row-display'
import {
  resolveMobileHistorySessionTitle,
  resolveMobileWorktreeAgentRowName
} from './mobile-session-names'

function makeMobileRow(overrides: Partial<RuntimeWorktreeAgentRow> = {}): RuntimeWorktreeAgentRow {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    parentPaneKey: null,
    state: 'working',
    agentType: 'claude',
    prompt: '你觉得呢',
    taskTitle: null,
    displayName: null,
    lastAssistantMessage: 'The message to He Shijie has been sent.',
    toolName: null,
    toolInput: null,
    interrupted: false,
    stateStartedAt: 1_000,
    updatedAt: 1_000,
    ...overrides
  }
}

describe('mobile session-names unification', () => {
  it('prefers listed activity.title over missing or stale conversationName so follow-up prompt never replaces session title', () => {
    const row = makeMobileRow({
      conversationName: undefined,
      activity: {
        listed: true,
        status: 'working',
        unread: false,
        clearable: false,
        sortAt: 1_000,
        title: '评审消息通知闭环'
      }
    })

    expect(resolveMobileWorktreeAgentRowName(row)).toBe('评审消息通知闭环')
    expect(agentDisplayLabel(row, 1_500)).toBe(
      '评审消息通知闭环 · The message to He Shijie has been sent.'
    )

    const unlistedRow = makeMobileRow({
      conversationName: '主机侧正式会话名',
      activity: { listed: false }
    })
    expect(resolveMobileWorktreeAgentRowName(unlistedRow)).toBe('主机侧正式会话名')
  })

  it('preserves forked chat lead splitting when resolved from activity.title or conversationName', () => {
    const forkedRow = makeMobileRow({
      conversationForked: true,
      conversationName: '分支方案评审',
      lastAssistantMessage: '已完成对比'
    })
    const label = agentDisplayLabel(forkedRow, 1_500)
    expect(agentDisplayForkedLead(forkedRow, label)).toEqual({
      name: '分支方案评审',
      rest: ' · 已完成对比'
    })
  })

  it('resolves mobile history session titles through the canonical provider/generated/fallback chain', () => {
    const pollutedHistorySession = {
      id: 'claude:12345678-aaaa-4bbb-8ccc-1234567890ab',
      sessionId: '12345678-aaaa-4bbb-8ccc-1234567890ab',
      agent: 'claude' as const,
      title: '你觉得呢',
      providerName: { kind: 'absent' as const },
      generatedTitle: '首轮合格任务标题'
    }
    expect(resolveMobileHistorySessionTitle(pollutedHistorySession)).toBe('首轮合格任务标题')

    const unnamedHistorySession = {
      ...pollutedHistorySession,
      generatedTitle: null
    }
    expect(resolveMobileHistorySessionTitle(unnamedHistorySession)).toBe('Claude 12345678')

    expect(
      resolveMobileHistorySessionTitle({
        id: 's1',
        agent: 'claude'
      })
    ).toBe('')
  })
})
