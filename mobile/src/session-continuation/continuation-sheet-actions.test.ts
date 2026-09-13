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
    fullContextAvailable: true,
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
      CONTINUATION_COPY.modeFocused,
      CONTINUATION_COPY.continueWith('claude'),
      CONTINUATION_COPY.continueWith('codex')
    ])
    expect(actions[0].skipAutoClose).toBe(true)
    actions[0].onPress()
    expect(onToggleMode).toHaveBeenCalledOnce()
    actions[2].onPress()
    expect(onStart).toHaveBeenCalledWith('codex')
  })

  it('reflects the selected mode on the toggle row', () => {
    const { actions } = build({ contextMode: 'full' })

    expect(actions[0].label).toBe(CONTINUATION_COPY.modeFull)
    expect(actions[0].hint).toBe(CONTINUATION_COPY.modeFullHint)
  })

  it('disables the mode row when the session has no transcript to read in full', () => {
    const { actions } = build({ fullContextAvailable: false })

    expect(actions[0].disabled).toBe(true)
    expect(actions[0].hint).toBe(CONTINUATION_COPY.modeFullUnavailableHint)
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
