import { describe, expect, it, vi } from 'vitest'
import { buildMobileContinuationSheetActions } from './continuation-sheet-actions'
import { CONTINUATION_COPY } from './continuation-copy'

type SheetArgs = Parameters<typeof buildMobileContinuationSheetActions>[0]

function build(overrides: Partial<SheetArgs> = {}) {
  const onToggleMode = vi.fn()
  const onStart = vi.fn()
  const actions = buildMobileContinuationSheetActions({
    agents: { status: 'ready', agents: ['claude', 'codex'] },
    contextMode: 'focused',
    onToggleMode,
    onStart,
    ...overrides
  })
  return { actions, onToggleMode, onStart }
}

describe('mobile continuation sheet rows', () => {
  it('offers a context-mode row that keeps the sheet open, then one row per agent', () => {
    const { actions, onToggleMode, onStart } = build()

    expect(actions.map((action) => action.label)).toEqual([
      CONTINUATION_COPY.switchToFull,
      CONTINUATION_COPY.continueWith('claude'),
      CONTINUATION_COPY.continueWith('codex')
    ])
    expect(actions[0].skipAutoClose).toBe(true)
    actions[0].onPress()
    expect(onToggleMode).toHaveBeenCalledOnce()
    actions[2].onPress()
    expect(onStart).toHaveBeenCalledWith('codex')
  })

  it('names the mode it switches to, and describes the one in effect', () => {
    const focused = build().actions[0]
    expect(focused.label).toBe(CONTINUATION_COPY.switchToFull)
    expect(focused.hint).toBe(CONTINUATION_COPY.modeFocusedHint)

    const full = build({ contextMode: 'full' }).actions[0]
    expect(full.label).toBe(CONTINUATION_COPY.switchToFocused)
    expect(full.hint).toBe(CONTINUATION_COPY.modeFullHint)
  })

  it('shows a loading row while agents are being detected', () => {
    const { actions } = build({ agents: { status: 'loading' } })

    expect(actions[1]).toMatchObject({
      label: CONTINUATION_COPY.detecting,
      loading: true,
      disabled: true
    })
  })

  it('explains a failed detection and an empty result without offering a dead end', () => {
    expect(build({ agents: { status: 'failed' } }).actions[1]).toMatchObject({
      label: CONTINUATION_COPY.detectFailed,
      disabled: true
    })
    expect(build({ agents: { status: 'ready', agents: [] } }).actions[1]).toMatchObject({
      label: CONTINUATION_COPY.noAgents,
      disabled: true
    })
  })
})
