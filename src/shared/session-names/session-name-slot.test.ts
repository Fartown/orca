import { describe, expect, it } from 'vitest'
import { projectSessionNameSlot, sessionNameSlotCandidates } from './session-name-slot'
import { resolveSessionDisplayTitle } from '../session-display-title'
import { resolveTerminalTabTitle } from '../tab-title-resolution'

const identity = { agent: 'codex' as const, sessionId: 'session' }
const named = {
  ...identity,
  title: 'First prompt',
  providerName: {
    kind: 'named' as const,
    title: 'Provider name',
    field: 'session_index.thread_name'
  },
  generatedTitle: '运行测试'
}

describe('shared session name projection', () => {
  it('keeps the native name and the legacy manual candidate separately', () => {
    const slot = projectSessionNameSlot({ ...identity, title: named, manualTitle: 'Old manual' })!
    expect(slot.title).toBe('Provider name')
    expect(slot.manualTitle).toBe('Old manual')
    expect(resolveSessionDisplayTitle(sessionNameSlotCandidates(slot))?.source).toBe('provider')
  })

  it('absence and unavailability retain native evidence; explicit clear reveals the manual fallback', () => {
    const previous = projectSessionNameSlot({
      ...identity,
      title: named,
      manualTitle: 'Old manual'
    })!
    for (const kind of ['absent', 'unavailable'] as const) {
      expect(
        projectSessionNameSlot({
          ...identity,
          previous,
          evidence: { ...identity, providerName: { kind } },
          manualTitle: 'Old manual'
        })?.title
      ).toBe('Provider name')
    }
    expect(
      projectSessionNameSlot({
        ...identity,
        previous,
        evidence: { ...identity, providerName: { kind: 'cleared' } },
        manualTitle: 'Old manual'
      })?.title
    ).toBe('Old manual')
  })

  it('a different session never inherits the previous native cache', () => {
    const slot = projectSessionNameSlot({
      ...identity,
      sessionId: 'new',
      previous: named,
      evidence: { ...identity, sessionId: 'new', providerName: { kind: 'unavailable' } },
      manualTitle: null
    })!
    expect(slot.title).not.toBe('Provider name')
    expect(slot.providerName?.kind).toBe('unavailable')
  })

  it('old peers degrade without falsely asserting native provenance', () => {
    const slot = projectSessionNameSlot({
      ...identity,
      title: { ...identity, title: 'Legacy mixed title' },
      manualTitle: 'Old manual'
    })!
    expect(slot.providerName).toBeUndefined()
    expect(slot.title).toBe('Old manual')
  })

  it('scanner task fallback works with renderer generation disabled', () => {
    const slot = projectSessionNameSlot({
      ...identity,
      title: { ...named, providerName: { kind: 'absent' } },
      manualTitle: null
    })!
    expect(
      resolveTerminalTabTitle(
        { aiVaultTitle: slot, title: 'Live step', customTitle: 'Container' },
        false
      )
    ).toBe('运行测试')
  })
})
