import { expect, it, vi } from 'vitest'

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/runtime/native-chat/session-ownership/structured-agent-session-owner', () => ({
  structuredAgentSessionTargetForTab: () => null
}))
vi.mock('@/lib/agent-session/launch/structured-agent-session-launch-message', () => ({
  relaunchFailedStructuredAgentSessionWithMessage: () => null
}))
vi.mock('@/lib/agent-session/launch/structured-agent-session-launch-registry', () => ({
  getStructuredAgentSessionLaunchLifecycle: () => null
}))
vi.mock('@/lib/agent-session/launch/structured-agent-session-launch-input', () => ({
  structuredAgentSessionLaunchHasRetainedInput: () => false
}))
vi.mock(
  '@/components/native-chat/session/structured/delivery/structured-agent-session-message-sender',
  () => ({ sendStructuredAgentSessionMessage: vi.fn() })
)
vi.mock('@/lib/agent-session/messaging/terminal/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: vi.fn()
}))

import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { sendNotesToActiveAgentSession } from '@/lib/agent-session/messaging/terminal/active-agent-note-send'

// Why: the dispatcher wake re-checks the real terminal input before paste and submit, so an unsent
// draft the user is typing is never overwritten (REQ-031).
it('passes an optional wake guard through the selected terminal send', async () => {
  vi.mocked(sendNotesToActiveAgentSession).mockResolvedValueOnce({ status: 'sent' })
  const guard = vi.fn(() => true)
  await sendMessageToAgent({
    worktreeId: 'wt-1',
    target: { kind: 'terminal', tabId: 'tab-1', leafId: 'leaf-1' },
    prompt: 'wake',
    beforeTerminalSend: guard
  })
  expect(sendNotesToActiveAgentSession).toHaveBeenCalledWith(
    expect.objectContaining({ beforeTerminalSend: guard })
  )
})
