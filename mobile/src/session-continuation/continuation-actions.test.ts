import { describe, expect, it, vi } from 'vitest'

// Why: lucide-react-native ships native-only ESM that vitest's node env cannot resolve; the
// sibling action-sheet tests stub it the same way.
vi.mock('lucide-react-native', () => ({ MessageSquarePlus: vi.fn() }))

import { getMobileSessionContinuationActions } from './continuation-actions'
import { CONTINUATION_COPY } from './continuation-copy'
import type { MobileContinuationTab } from './continuation-source'

type MenuTab = MobileContinuationTab & { id: string; terminal: string | null }

function menuTab(overrides: Partial<MenuTab> = {}): MenuTab {
  return {
    id: 'tab-1',
    terminal: 'term_1',
    type: 'terminal',
    title: 'Add auth',
    launchAgent: 'claude',
    agentStatus: {
      state: 'idle',
      prompt: '',
      agentType: 'claude',
      providerSession: { id: 's', transcriptPath: '/t.jsonl' }
    } as MenuTab['agentStatus'],
    ...overrides
  }
}

function build(
  overrides: { tabs?: readonly MenuTab[]; handle?: string | null; supported?: boolean | null } = {}
) {
  const onDismiss = vi.fn()
  const onOpen = vi.fn()
  const actions = getMobileSessionContinuationActions({
    terminalHandle: overrides.handle === undefined ? 'term_1' : overrides.handle,
    tabs: overrides.tabs ?? [menuTab()],
    hostSupported: overrides.supported === undefined ? true : overrides.supported,
    onDismiss,
    onOpen
  })
  return { actions, onDismiss, onOpen }
}

describe('mobile session continuation menu entry', () => {
  it('offers the entry for a continuable terminal and opens the picker on press', () => {
    const { actions, onDismiss, onOpen } = build()

    expect(actions).toHaveLength(1)
    expect(actions[0].label).toBe(CONTINUATION_COPY.menuLabel)
    expect(actions[0].closeBeforePress).toBe(true)
    actions[0].onPress()
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith(menuTab())
  })

  it('stays absent rather than disabled when the session cannot be continued', () => {
    expect(build({ tabs: [menuTab({ agentStatus: null, launchAgent: 'goose' })] }).actions).toEqual(
      []
    )
    expect(
      build({
        tabs: [
          menuTab({
            agentStatus: {
              state: 'idle',
              prompt: '',
              agentType: 'claude'
            } as MenuTab['agentStatus']
          })
        ]
      }).actions
    ).toEqual([])
  })

  it('stays absent until the host capability is confirmed', () => {
    expect(build({ supported: null }).actions).toEqual([])
    expect(build({ supported: false }).actions).toEqual([])
  })

  it('stays absent when no tab matches the pressed handle', () => {
    expect(build({ handle: null }).actions).toEqual([])
    expect(build({ handle: 'term_other' }).actions).toEqual([])
  })
})
