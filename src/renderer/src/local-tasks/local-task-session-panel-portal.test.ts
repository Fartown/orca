// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import {
  planLocalTaskSessionPortal,
  resolveLocalTaskSessionPaneKey
} from './local-task-session-panel-portal'
import { toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'

const LEAF = '11111111-1111-4111-8111-111111111111'

const candidate = {
  slotId: 'local-task-session',
  requestToken: 'one',
  target: document.createElement('div'),
  worktreeId: 'workspace',
  tabId: 'tab',
  paneKey: 'tab:leaf'
}

it('keeps an already portaled terminal in place on disconnect without requesting a mount', () => {
  const connected = planLocalTaskSessionPortal(candidate, true, null)
  expect(connected.requestMount).toBe(true)
  expect(connected.descriptor?.active).toBe(true)
  const disconnected = planLocalTaskSessionPortal(candidate, false, connected.descriptor)
  expect(disconnected).toMatchObject({
    requestMount: false,
    descriptor: { active: false, target: candidate.target }
  })
})

it('does not mount a disconnected session that was never shown', () => {
  expect(planLocalTaskSessionPortal(candidate, false, null)).toEqual({
    descriptor: null,
    requestMount: false
  })
  expect(
    planLocalTaskSessionPortal({ ...candidate, requestToken: 'two' }, false, {
      ...candidate,
      active: true
    })
  ).toEqual({ descriptor: null, requestMount: false })
})

it('uses the mirrored SSH terminal layout when a linked session has only a host tab id', () => {
  const tabId = toWebTerminalSurfaceTabId('host-tab')
  expect(
    resolveLocalTaskSessionPaneKey(
      { tabId, paneKey: null },
      {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'remote-pty' }
      }
    )
  ).toBe(`${tabId}:${LEAF}`)
  expect(resolveLocalTaskSessionPaneKey({ tabId, paneKey: null }, undefined)).toBeNull()
})
