import { describe, expect, it, vi } from 'vitest'
import { ensureTerminal } from './app-driver.mjs'

function hiddenButton() {
  return {
    first: () => hiddenButton(),
    isVisible: vi.fn().mockResolvedValue(false),
    click: vi.fn()
  }
}

// Ported from the app-driver suite upstream retired as low-value (#38129); guards daemon continuity checks.
describe('ensureTerminal', () => {
  it('reveals the restored terminal behind tasks without creating a replacement', async () => {
    let terminalVisible = false
    const xterm = { first: vi.fn(), waitFor: vi.fn().mockResolvedValue(undefined) }
    xterm.first.mockReturnValue(xterm)
    const terminal = {
      first: vi.fn(),
      isVisible: vi.fn(async () => terminalVisible),
      waitFor: vi.fn(async () => expect(terminalVisible).toBe(true)),
      locator: vi.fn().mockReturnValue(xterm)
    }
    terminal.first.mockReturnValue(terminal)
    const closeTasks = {
      first: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn(async () => {
        terminalVisible = true
      })
    }
    closeTasks.first.mockReturnValue(closeTasks)
    const create = hiddenButton()
    const page = {
      locator: vi.fn().mockReturnValue(terminal),
      getByRole: vi.fn((_role, { name }) => (name === 'Close tasks' ? closeTasks : create)),
      keyboard: { press: vi.fn() },
      isClosed: vi.fn().mockReturnValue(false)
    }

    await ensureTerminal(page, { allowCreate: false })

    expect(closeTasks.click).toHaveBeenCalledOnce()
    expect(terminal.waitFor).toHaveBeenCalledOnce()
    expect(xterm.waitFor).toHaveBeenCalledOnce()
    expect(create.click).not.toHaveBeenCalled()
    expect(page.keyboard.press).not.toHaveBeenCalled()
  })
})
