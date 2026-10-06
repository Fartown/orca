import { describe, expect, it, vi } from 'vitest'

// Why: lucide-react-native ships native-only ESM that vitest's node env cannot resolve; the
// sibling action-sheet tests stub it the same way.
vi.mock('lucide-react-native', () => ({ MessageSquarePlus: vi.fn() }))

import { getMobileSessionContinuationActions } from './continuation-actions'
import { CONTINUATION_COPY } from './continuation-copy'
import type { MobileContinuationTab } from './continuation-source'
import { continuationAgentStatus } from './continuation-agent-status-fixture'

type MenuTab = MobileContinuationTab & { id: string; terminal: string | null }

function menuTab(overrides: Partial<MenuTab> = {}): MenuTab {
  return {
    id: 'tab-1',
    terminal: 'term_1',
    type: 'terminal',
    title: 'Add auth',
    launchAgent: 'claude',
    agentStatus: continuationAgentStatus({
      prompt: '',
      agentType: 'claude',
      providerSession: { key: 'session_id', id: 's', transcriptPath: '/t.jsonl' }
    }),
    ...overrides
  }
}

function build(overrides: { tabs?: readonly MenuTab[]; handle?: string | null } = {}) {
  const onDismiss = vi.fn()
  const onOpen = vi.fn()
  const actions = getMobileSessionContinuationActions({
    terminalHandle: overrides.handle === undefined ? 'term_1' : overrides.handle,
    tabs: overrides.tabs ?? [menuTab()],
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
            agentStatus: continuationAgentStatus({
              prompt: '',
              agentType: 'claude'
            })
          })
        ]
      }).actions
    ).toEqual([])
  })

  it('stays absent when no tab matches the pressed handle', () => {
    expect(build({ handle: null }).actions).toEqual([])
    expect(build({ handle: 'term_other' }).actions).toEqual([])
  })
})
