import { describe, expect, it } from 'vitest'
import { generatedTabTitleForStatus } from '../agent-status/presentation/agent-generated-tab-title-rules'
import { deriveGeneratedTabTitle } from '../agent-status/presentation/agent-tab-title'
import { resolveScannedSessionDisplayName } from './scanned-session-display-name'
import { isEligibleSessionNamePrompt } from './session-name-candidate-quality'

describe('session-name prompt candidate quality & scanned display', () => {
  it('rejects Orca mail banners, batch mail wrappers, persisted From TERM headers, and continuation boilerplate', () => {
    expect(
      isEligibleSessionNamePrompt(
        '────────────────────────────────────────\nFrom: TERM-2 (claude) · 10:20\nSubject: Re: Review\n请帮忙检查修复'
      )
    ).toBe(false)
    expect(
      isEligibleSessionNamePrompt(
        '--- Orchestration Messages (2) ---\n\nFrom: DISPATCH-1 · 10:21\n收到'
      )
    ).toBe(false)
    expect(isEligibleSessionNamePrompt('From TERM 2 claude Review PR 158')).toBe(false)
    expect(isEligibleSessionNamePrompt('Orchestration Messages 3')).toBe(false)
    expect(
      isEligibleSessionNamePrompt(
        'Continue work from the prior Orca session on this branch and verify all gates.'
      )
    ).toBe(false)
  })

  it('extracts === TASK === body from Orca dispatch preambles beyond 512 chars before deriving title', () => {
    const padding = 'Context line for worker coordination.\n'.repeat(20)
    const dispatchPrompt = [
      'Please carry out this task from my Orca coordinator by following the brief I pasted below.',
      '<pasted_content id="1">',
      'You are working inside Orca, a multi-agent IDE.',
      'Your task ID is: DISPATCH-42',
      padding,
      '=== TASK ===',
      '统一桌面端与移动端配对智能体列表的会话标题优先级',
      '=== CONTEXT ===',
      'See docs/issue/会话命名与身份保护/requirements/会话命名与身份保护.md',
      '</pasted_content>'
    ].join('\n')

    expect(deriveGeneratedTabTitle(dispatchPrompt)).toBe(
      '统一桌面端与移动端配对智能体列表的会话标题优先级'
    )
  })

  it('allows generatedTabTitleForStatus beside quickCommandLabel and replaces polluted existing titles', () => {
    const withQuickCommand = generatedTabTitleForStatus(
      { prompt: '修复跨端会话标题不一致问题' },
      { quickCommandLabel: 'Claude', generatedTitle: null }
    )
    expect(withQuickCommand).toEqual({
      title: '修复跨端会话标题不一致问题',
      replaceExisting: false
    })

    const overPollutedExisting = generatedTabTitleForStatus(
      { prompt: '修复跨端会话标题不一致问题' },
      { generatedTitle: 'From TERM 2 claude' }
    )
    expect(overPollutedExisting).toEqual({
      title: '修复跨端会话标题不一致问题',
      replaceExisting: true
    })

    const keepsEligibleExisting = generatedTabTitleForStatus(
      { prompt: '后续追问内容不应覆盖首轮任务摘要' },
      { generatedTitle: '既有的首轮任务摘要' }
    )
    expect(keepsEligibleExisting).toBeNull()
  })

  it('resolves scanned session display names in canonical priority order and isolates subagents', () => {
    const baseSession = {
      id: 'claude:abcdef12-3456-7890-abcd-ef1234567890',
      sessionId: 'abcdef12-3456-7890-abcd-ef1234567890',
      agent: 'claude' as const,
      title: '你觉得呢',
      providerName: { kind: 'absent' as const },
      generatedTitle: '首轮合格任务标题'
    }

    expect(
      resolveScannedSessionDisplayName(baseSession, {
        userTitle: '手动会话名称',
        cached: {
          providerName: { kind: 'named', title: '原生会话名称', field: 'custom-title.customTitle' }
        }
      })
    ).toBe('手动会话名称')

    expect(
      resolveScannedSessionDisplayName(baseSession, {
        cached: {
          providerName: { kind: 'named', title: '原生会话名称', field: 'custom-title.customTitle' }
        }
      })
    ).toBe('原生会话名称')

    expect(resolveScannedSessionDisplayName(baseSession)).toBe('首轮合格任务标题')

    const unnamedNoGenerated = {
      ...baseSession,
      generatedTitle: null
    }
    expect(resolveScannedSessionDisplayName(unnamedNoGenerated)).toBe('Claude abcdef12')

    const subagentSession = {
      ...unnamedNoGenerated,
      id: 'subagent-file-id-1234',
      subagent: {
        parentSessionId: baseSession.sessionId,
        agentId: 'subagent-1',
        agentType: 'Explore',
        status: 'completed' as const
      },
      generatedTitle: '子智能体独立摘要'
    }
    expect(
      resolveScannedSessionDisplayName(subagentSession, {
        userTitle: '父会话手动改名',
        cached: {
          providerName: {
            kind: 'named',
            title: '父会话原生标题',
            field: 'custom-title.customTitle'
          }
        }
      })
    ).toBe('子智能体独立摘要')
  })
})
