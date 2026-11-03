import { describe, expect, it } from 'vitest'
import { deriveGeneratedTabTitle } from '../agent-tab-title'
import { getAgentRowConversationName } from '../agent-row-conversation-name'
import { resolveSessionDisplayTitle } from '../session-display-title'
import { resolveTerminalTabTitle, resolveUnifiedTabLabel } from '../tab-title-resolution'

describe('REQ-025 manual-first naming contract', () => {
  it('uses manual, Provider, stable prompt, live, owned label, then identity fallback', () => {
    const candidates = {
      providerTitle: 'Provider name',
      userTitle: 'Manual name',
      generatedTitle: 'Fix login',
      liveTitle: 'Running login tests',
      labelTitle: 'Launch label',
      identityFallbackTitle: 'Codex abcd1234'
    }
    expect(resolveSessionDisplayTitle(candidates)?.title).toBe('Manual name')
    expect(resolveSessionDisplayTitle({ ...candidates, userTitle: null })?.title).toBe(
      'Provider name'
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

  it('keeps a manual name above a confirmed Provider snapshot', () => {
    expect(
      resolveSessionDisplayTitle({
        providerTitleSnapshot: 'Known Provider name',
        userTitle: 'Manual name'
      })?.title
    ).toBe('Manual name')
  })

  it.each(['claude', 'codex'] as const)(
    'lets a %s tab rename, but not its quick-command label, override the Provider name',
    (agent) => {
      const aiVaultTitle = {
        agent,
        sessionId: 'session-a',
        title: 'Provider name',
        providerName: { kind: 'named' as const, title: 'Provider name', field: 'test.nativeName' },
        source: 'provider' as const
      }
      const tab = {
        customTitle: 'Tab rename',
        quickCommandLabel: 'Launch label',
        aiVaultTitle,
        generatedTitle: 'Fix login',
        title: 'Running tests'
      }
      const unified = (customLabel: string | null) =>
        resolveUnifiedTabLabel(
          {
            customLabel,
            quickCommandLabel: tab.quickCommandLabel,
            aiVaultTitle,
            generatedLabel: tab.generatedTitle,
            label: tab.title
          },
          true
        )
      expect(resolveTerminalTabTitle(tab, true)).toBe('Tab rename')
      expect(unified(tab.customTitle)).toBe('Tab rename')
      // The rename on the tab itself outranks a shared manual name for the session.
      expect(
        getAgentRowConversationName(tab, agent, true, undefined, { userTitle: 'Manual name' })
      ).toBe('Tab rename')
      const unnamed = { ...tab, customTitle: null }
      expect(resolveTerminalTabTitle(unnamed, true)).toBe('Provider name')
      expect(unified(null)).toBe('Provider name')
      expect(
        getAgentRowConversationName(unnamed, agent, true, undefined, { userTitle: 'Manual name' })
      ).toBe('Manual name')
      expect(getAgentRowConversationName(unnamed, agent, true)).toBe('Provider name')
    }
  )

  it('puts an Agent tab manual rename above the Provider name and the live title', () => {
    const named = {
      agent: 'claude' as const,
      sessionId: 'session-a',
      title: 'Provider name',
      providerName: { kind: 'named' as const, title: 'Provider name', field: 'test.nativeName' }
    }
    for (const aiVaultTitle of [named, undefined]) {
      const tab = {
        customTitle: 'ANSWER HERE: gate 004',
        launchAgent: 'claude' as const,
        aiVaultTitle,
        title: '✳ gate question'
      }
      expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe('ANSWER HERE: gate 004')
      expect(getAgentRowConversationName(tab, 'claude', true)).toBe('ANSWER HERE: gate 004')
      expect(resolveTerminalTabTitle({ ...tab, customTitle: null }, true, tab.title)).toBe(
        aiVaultTitle ? 'Provider name' : 'gate question'
      )
    }
  })

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
