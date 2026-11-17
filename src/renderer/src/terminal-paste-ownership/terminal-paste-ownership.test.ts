// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureTerminalPasteOwnership } from './terminal-paste-ownership'

afterEach(() => document.body.replaceChildren())

function fixture() {
  const container = document.createElement('div')
  const helper = document.createElement('textarea')
  helper.className = 'xterm-helper-textarea'
  container.append(helper)
  document.body.append(container)
  helper.focus()
  const transport = { getPtyId: vi.fn(() => 'original-pty'), isConnected: vi.fn(() => true) }
  const panes = [{ id: 1, leafId: 'original-leaf' }]
  const paneTransports = new Map([[1, transport]])
  const readTargetState = () => ({
    manager: { getPanes: () => panes },
    paneTransports,
    paneId: 1,
    leafId: 'original-leaf',
    transport: paneTransports.get(1),
    ptyId: paneTransports.get(1)?.getPtyId() ?? null
  })
  const ownership = captureTerminalPasteOwnership({
    readTargetState,
    paneContainer: container,
    requireFocus: true
  })
  return { ownership, container, helper, transport, panes, paneTransports, readTargetState }
}

describe('paste ownership captured before asynchronous clipboard reads', () => {
  it('keeps the original target when its helper node is replaced in the same pane', () => {
    const f = fixture()
    const replacement = document.createElement('textarea')
    replacement.className = 'xterm-helper-textarea'
    f.helper.replaceWith(replacement)
    replacement.focus()
    expect(f.helper.isConnected).toBe(false)
    expect(f.ownership.isTargetCurrent()).toBe(true)
    expect(f.ownership.ptyId).toBe('original-pty')
  })

  it('allows the existing transient body-blur policy', () => {
    const f = fixture()
    f.helper.blur()
    expect(document.activeElement).toBe(document.body)
    expect(f.ownership.isTargetCurrent()).toBe(true)
  })

  it.each(['another pane', 'another input'])('rejects focus moved to %s', (destination) => {
    const f = fixture()
    const input = document.createElement('textarea')
    if (destination === 'another pane') {
      input.className = 'xterm-helper-textarea'
    }
    document.body.append(input)
    input.focus()
    expect(f.ownership.isTargetCurrent()).toBe(false)
    expect(f.ownership.getFailure()).toBe('focus-changed')
    expect(f.ownership.canContinue()).toBe(true)
  })

  it('does not reinterpret an originally foreign focus as this pane ownership', () => {
    const f = fixture()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const ownership = captureTerminalPasteOwnership({
      readTargetState: f.readTargetState,
      paneContainer: f.container,
      requireFocus: true
    })
    f.helper.focus()
    expect(ownership.isTargetCurrent()).toBe(false)
    expect(ownership.getFailure()).toBe('focus-changed')
  })

  it.each(['transport', 'pty', 'leaf', 'removed pane'])('rejects a changed %s', (change) => {
    const f = fixture()
    if (change === 'transport') {
      f.paneTransports.set(1, {
        getPtyId: vi.fn(() => 'original-pty'),
        isConnected: vi.fn(() => true)
      })
    } else if (change === 'pty') {
      f.transport.getPtyId.mockReturnValue('replacement-pty')
    } else if (change === 'leaf') {
      f.panes[0].leafId = 'replacement-leaf'
    } else {
      f.panes.length = 0
    }
    expect(f.ownership.isTargetCurrent()).toBe(false)
    expect(f.ownership.getFailure()).toBe('target-changed')
    expect(f.ownership.canContinue()).toBe(false)
    expect(f.ownership.ptyId).toBe('original-pty')
  })

  it('classifies loss of contact without asserting the process exited', () => {
    const f = fixture()
    f.transport.isConnected.mockReturnValue(false)
    expect(f.ownership.isTargetCurrent()).toBe(false)
    expect(f.ownership.getFailure()).toBe('target-disconnected')
    expect(f.ownership.canContinue()).toBe(false)
  })

  it('keeps context-menu ownership independent from DOM focus', () => {
    const f = fixture()
    const ownership = captureTerminalPasteOwnership({
      readTargetState: f.readTargetState,
      paneContainer: f.container,
      requireFocus: false
    })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(ownership.isTargetCurrent()).toBe(true)
  })
})
