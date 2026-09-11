import { describe, expect, it } from 'vitest'
import { deriveGeneratedTabTitle } from '../agent-tab-title'
import { getAgentRowConversationName } from '../agent-row-conversation-name'
import { resolveSessionDisplayTitle } from '../session-display-title'
import { resolveTerminalTabTitle, resolveUnifiedTabLabel } from '../tab-title-resolution'

describe('REQ-025 provider-first naming contract', () => {
  it('uses Provider, manual, stable prompt, live, owned label, then identity fallback', () => {
    const candidates = {
      providerTitle: 'Provider name',
      userTitle: 'Manual name',
      generatedTitle: 'Fix login',
      liveTitle: 'Running login tests',
      labelTitle: 'Launch label',
      identityFallbackTitle: 'Codex abcd1234'
    }
    expect(resolveSessionDisplayTitle(candidates)?.title).toBe('Provider name')
    expect(resolveSessionDisplayTitle({ ...candidates, providerTitle: null })?.title).toBe(
      'Manual name'
    )
    expect(
      resolveSessionDisplayTitle({ ...candidates, providerTitle: null, userTitle: null })?.title
    ).toBe('Fix login')
    expect(
      resolveSessionDisplayTitle({
        liveTitle: candidates.liveTitle,
        labelTitle: candidates.labelTitle
      })?.title
    ).toBe('Running login tests')
    expect(
      resolveSessionDisplayTitle({
        labelTitle: candidates.labelTitle,
        identityFallbackTitle: candidates.identityFallbackTitle
      })?.title
    ).toBe('Launch label')
    expect(
      resolveSessionDisplayTitle({ identityFallbackTitle: candidates.identityFallbackTitle })?.title
    ).toBe('Codex abcd1234')
  })

  it('keeps a confirmed Provider snapshot above a manual fallback', () => {
    expect(
      resolveSessionDisplayTitle({
        providerTitleSnapshot: 'Known Provider name',
        userTitle: 'Manual name'
      })?.title
    ).toBe('Known Provider name')
  })

  it.each(['claude', 'codex'] as const)(
    'does not let %s tab labels override the Provider name',
    (agent) => {
      const aiVaultTitle = {
        agent,
        sessionId: 'session-a',
        title: 'Provider name',
        providerName: { kind: 'named' as const, title: 'Provider name', field: 'test.nativeName' },
        source: 'provider' as const
      }
      const tab = {
        customTitle: 'Container alias',
        quickCommandLabel: 'Launch label',
        aiVaultTitle,
        generatedTitle: 'Fix login',
        title: 'Running tests'
      }
      expect(resolveTerminalTabTitle(tab, true)).toBe('Provider name')
      expect(
        resolveUnifiedTabLabel(
          {
            customLabel: tab.customTitle,
            quickCommandLabel: tab.quickCommandLabel,
            aiVaultTitle,
            generatedLabel: tab.generatedTitle,
            label: tab.title
          },
          true
        )
      ).toBe('Provider name')
      expect(
        getAgentRowConversationName(tab, agent, true, undefined, { userTitle: 'Manual name' })
      ).toBe('Provider name')
    }
  )

  it.each(['继续', '好的', 'OK!', 'continue', '谢谢。', 'please', 'hello'])(
    'rejects prompt-only %s without rejecting an explicit name',
    (prompt) => {
      expect(deriveGeneratedTabTitle(prompt)).toBeNull()
      expect(
        resolveSessionDisplayTitle({ generatedTitle: prompt, liveTitle: 'Run login tests' })?.title
      ).toBe('Run login tests')
      expect(
        resolveSessionDisplayTitle({ providerTitle: prompt, generatedTitle: 'Fix login' })?.title
      ).toBe(prompt)
      expect(
        resolveSessionDisplayTitle({ userTitle: prompt, generatedTitle: 'Fix login' })?.title
      ).toBe(prompt)
    }
  )

  it.each(['继续修复登录超时', '运行测试', 'Fix a bug', 'Continue debugging login'])(
    'keeps the useful short request %s',
    (prompt) => {
      expect(deriveGeneratedTabTitle(prompt)).toBe(prompt)
    }
  )

  it('does not derive a name from an injected harness turn', () => {
    expect(
      deriveGeneratedTabTitle('<system-reminder>Run internal housekeeping</system-reminder>')
    ).toBeNull()
    expect(deriveGeneratedTabTitle('<my-element>Fix login</my-element>')).not.toBeNull()
  })

  it('does not assign a tab container alias to a different split pane', () => {
    const tab = {
      customTitle: 'Parent alias',
      quickCommandLabel: 'Parent command',
      title: 'Focused title'
    }
    expect(getAgentRowConversationName(tab, 'codex', true, null)).toBeNull()
    expect(getAgentRowConversationName(tab, 'codex', true, 'Sibling task')).toBe('Sibling task')
  })

  it('preserves ordinary shell container naming', () => {
    expect(
      resolveTerminalTabTitle(
        { customTitle: 'Build shell', quickCommandLabel: 'Watch', title: 'zsh' },
        true
      )
    ).toBe('Build shell')
    expect(
      resolveUnifiedTabLabel(
        { customLabel: 'Build shell', quickCommandLabel: 'Watch', label: 'zsh' },
        true
      )
    ).toBe('Build shell')
  })
})
