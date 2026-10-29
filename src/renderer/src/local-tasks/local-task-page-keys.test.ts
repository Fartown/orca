// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import {
  claimLocalTaskPageKeys,
  installLocalTaskPageKeyRouter,
  pushLocalTaskEscapeLayer,
  type LocalTaskPageKeyAction
} from './local-task-page-keys'

let cleanups: (() => void)[] = []
const actions: LocalTaskPageKeyAction[] = []
// Stands in for the upstream task page's Esc owner, which registers after app start.
const upstreamEscape = vi.fn()

function element(selector: string): HTMLElement {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) {
    throw new Error(`missing ${selector}`)
  }
  return found
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML =
    '<div data-local-task-page><input id="search" /><div id="row" role="button" tabindex="-1" data-local-task-row></div><button id="new">New</button></div><div id="sidebar" tabindex="-1"></div>'
  actions.length = 0
  upstreamEscape.mockClear()
  const onUpstreamKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      upstreamEscape()
    }
  }
  cleanups = [
    installLocalTaskPageKeyRouter(),
    claimLocalTaskPageKeys((action) => actions.push(action))
  ]
  addAppKeyListener('keydown', onUpstreamKey)
  cleanups.push(() => removeAppKeyListener('keydown', onUpstreamKey))
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

describe('local task page keys (REQ-007)', () => {
  it('runs single keys on the page but never while typing in a field', () => {
    press(element('#search'), 'c')
    expect(actions).toEqual([])
    press(element('#row'), 'c')
    press(element('#row'), 'J')
    expect(actions).toEqual(['create', 'next'])
  })

  it('leaves keys alone outside the page and with a modifier held', () => {
    press(element('#sidebar'), 'c')
    press(element('#row'), 'c', { metaKey: true })
    expect(actions).toEqual([])
  })

  it('lets Enter press a focused button but opens the focused task row', () => {
    press(element('#new'), 'Enter')
    press(element('#row'), 'Enter')
    expect(actions).toEqual(['open'])
  })

  it('closes the innermost local layer on Esc instead of the task page', () => {
    const closeDetail = vi.fn()
    const closeDialog = vi.fn()
    cleanups.push(pushLocalTaskEscapeLayer('panel', closeDetail))
    const releaseDialog = pushLocalTaskEscapeLayer('dialog', closeDialog)
    press(element('#row'), 'Escape')
    expect(closeDialog).toHaveBeenCalledOnce()
    expect(closeDetail).not.toHaveBeenCalled()
    expect(upstreamEscape).not.toHaveBeenCalled()
    releaseDialog()
    press(element('#row'), 'Escape')
    expect(closeDetail).toHaveBeenCalledOnce()
  })

  it('lets the first Esc in a detail field reach the page, which blurs it', () => {
    const closeDetail = vi.fn()
    cleanups.push(pushLocalTaskEscapeLayer('panel', closeDetail))
    press(element('#search'), 'Escape')
    expect(closeDetail).not.toHaveBeenCalled()
    expect(upstreamEscape).toHaveBeenCalledOnce()
  })
})
