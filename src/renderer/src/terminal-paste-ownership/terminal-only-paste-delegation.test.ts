// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchAppMenuPasteEvent } from '@/lib/clipboard/menu/app-menu-paste'
import { registerTerminalPanePasteListeners } from '@/components/terminal-pane/input/paste/terminal-pane-paste-listeners'
import type { TerminalPaneCloseController } from '@/components/terminal-pane/layout/close/use-terminal-pane-close-actions'
import type { TerminalPanePasteExecution } from '@/components/terminal-pane/input/paste/terminal-pane-paste-execution'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager-types'

vi.mock('@/components/terminal-pane/clipboard/terminal-clipboard-event-paste', () => ({
  isClipboardEventPasteRequired: () => false,
  firesNativePasteEvent: () => true,
  getClipboardEventText: (event: ClipboardEvent) => event.clipboardData?.getData('text/plain') ?? ''
}))

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

type FakePane = Pick<ManagedPane, 'id' | 'container' | 'terminal'> & {
  helper: HTMLTextAreaElement
}

function terminalPane(id: number): FakePane {
  const container = document.createElement('div')
  container.className = 'pane'
  container.dataset.leafId = `leaf-${id}`
  const element = document.createElement('div')
  element.className = 'xterm'
  const helper = document.createElement('textarea')
  helper.className = 'xterm-helper-textarea'
  element.append(helper)
  container.append(element)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the listeners read only element and focus.
  const terminal = { element, focus: () => helper.focus() } as unknown as ManagedPane['terminal']
  return { id, container, terminal, helper }
}

describe('terminal-only paste', () => {
  it('delegates event and app-menu paste to the focused pane clipboard execution', () => {
    const container = document.createElement('div')
    const pane = terminalPane(1)
    const sibling = terminalPane(2)
    container.append(pane.container, sibling.container)
    document.body.append(container)
    const pasteFromClipboard = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the listeners use only these controller fields.
    const controller = {
      forceBracketedMultilineTextPaste: false,
      keybindings: {},
      worktreeId: 'workspace',
      managerRef: { current: { getActivePane: () => pane, getPanes: () => [pane, sibling] } },
      paneTransportsRef: { current: new Map() },
      setTerminalError: vi.fn()
    } as unknown as TerminalPaneCloseController
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these are the execution callbacks read by the listener.
    const execution = {
      pasteFromClipboard,
      executePanePasteText: vi.fn(),
      resolvePaneProtectedMultilinePasteOptions: () => undefined
    } as unknown as TerminalPanePasteExecution
    dispose = registerTerminalPanePasteListeners({
      container,
      controller,
      execution,
      isMac: false,
      shortcutPlatform: 'win32'
    })
    pane.helper.focus()

    const data = new DataTransfer()
    data.setData('text/plain', 'event text')
    pane.helper.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
    dispatchAppMenuPasteEvent()

    expect(pasteFromClipboard.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [pane, 'paste-event'],
      [pane, 'app-menu']
    ])
  })
})
