import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  info: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { info: mocks.info } }))
vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: mocks.send }))
vi.mock('./local-task-dispatcher-session', () => ({
  liveDispatcherPaneKey: () => 'tab-1:11111111-1111-4111-8111-111111111111',
  openLocalTaskDispatcher: async () => true
}))

import { LOCAL_TASK_DISPATCHER_GUIDE } from '../../../shared/local-tasks/local-task-brief'
import { askLocalTaskDispatcher, LOCAL_TASK_ASK_ONLY_PREFIX } from './local-task-dispatcher-ask'

describe('askLocalTaskDispatcher', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.info.mockReset()
  })

  it('counts a message whose arrival is unconfirmed as sent, so the person does not send it twice', async () => {
    mocks.send.mockResolvedValue({ status: 'unconfirmed', code: 'runtime-unverifiable' })
    await expect(
      askLocalTaskDispatcher({ agent: 'claude', text: 'what waits on me?', askOnly: true })
    ).resolves.toBe(true)
    expect(mocks.send.mock.calls[0][0].prompt).toMatch(/^\[Ask only: .*\]\nwhat waits on me\?$/)
    expect(mocks.info).toHaveBeenCalledWith(
      'Sent to the dispatcher, but its arrival is not confirmed yet. Check the conversation.'
    )
  })

  it('asks the person to send it there when it did not go in', async () => {
    mocks.send.mockResolvedValue({ status: 'not-writable', code: 'session-send-refused' })
    await expect(
      askLocalTaskDispatcher({ agent: 'claude', text: 'start the export', askOnly: false })
    ).resolves.toBe(false)
    expect(mocks.send.mock.calls[0][0].prompt).toBe('start the export')
    expect(mocks.info).toHaveBeenCalledWith(
      'The dispatcher is open. Your message was not sent; send it there.'
    )
  })

  it('marks an Ask the way the dispatcher guide recognizes, so both say the same thing', () => {
    expect(LOCAL_TASK_ASK_ONLY_PREFIX.startsWith('[Ask only:')).toBe(true)
    expect(LOCAL_TASK_DISPATCHER_GUIDE).toContain('A message that starts with [Ask only: ...]')
    expect(LOCAL_TASK_ASK_ONLY_PREFIX).toContain('offer a read-only investigation task')
  })
})
