import { describe, expect, it } from 'vitest'
import { AGENT_TUI_CLEAR_INPUT_MAX } from '../../shared/agent-launch/startup/agent-tui-input-clear'
import { writeDurableChatComposerPrefix } from './durable-chat-composer-input'

describe('host-owned Chat composer prefix', () => {
  const composer = {
    expectedSessionId: 'session',
    clearInput: '\x15',
    imagePaths: ['/remote/a b.png', '/remote/c.png'],
    expectedIncarnation: 'inc',
    expectedPtyId: 'pty'
  }
  it('keeps clear, separately framed image pastes and settling on the host', async () => {
    const events: (string | number)[] = []
    await writeDurableChatComposerPrefix({
      composer,
      text: 'prompt',
      confirmEmpty: async () => true,
      write: async (data) => {
        events.push(data)
      },
      delay: async (ms) => {
        events.push(ms)
      }
    })
    expect(events).toEqual([
      AGENT_TUI_CLEAR_INPUT_MAX,
      140,
      '\x1b[200~/remote/a\\ b.png\x1b[201~',
      '\x1b[200~/remote/c.png\x1b[201~ ',
      300
    ])
  })
  it('does not advance to images or Enter after a failed clear/body boundary', async () => {
    const events: string[] = []
    await expect(
      writeDurableChatComposerPrefix({
        composer,
        text: 'prompt',
        confirmEmpty: async () => true,
        write: async (data) => {
          events.push(data)
          throw new Error('partial write')
        },
        delay: async () => {}
      })
    ).rejects.toThrow('partial write')
    expect(events).toEqual([AGENT_TUI_CLEAR_INPUT_MAX])
  })
})
