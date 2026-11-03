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
  it('shows the manual name while keeping the native name as separate evidence', () => {
    const slot = projectSessionNameSlot({ ...identity, title: named, manualTitle: 'Old manual' })!
    expect(slot.title).toBe('Old manual')
    expect(slot.manualTitle).toBe('Old manual')
    expect(slot.providerName).toMatchObject({ kind: 'named', title: 'Provider name' })
    expect(resolveSessionDisplayTitle(sessionNameSlotCandidates(slot))?.source).toBe('user')
  })

  it('absence and unavailability retain native evidence; explicit clear drops it', () => {
    const previous = projectSessionNameSlot({ ...identity, title: named, manualTitle: null })!
    for (const kind of ['absent', 'unavailable'] as const) {
      expect(
        projectSessionNameSlot({
          ...identity,
          previous,
          evidence: { ...identity, providerName: { kind } },
          manualTitle: null
        })?.title
      ).toBe('Provider name')
    }
    const cleared = { ...identity, providerName: { kind: 'cleared' as const } }
    expect(
      projectSessionNameSlot({ ...identity, previous, evidence: cleared, manualTitle: null })?.title
    ).toBe('运行测试')
    expect(
      projectSessionNameSlot({
        ...identity,
        previous,
        evidence: cleared,
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
      resolveTerminalTabTitle({ aiVaultTitle: slot, title: 'Live step', customTitle: null }, false)
    ).toBe('运行测试')
  })
})
