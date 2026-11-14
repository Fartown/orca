import { afterEach, expect, it } from 'vitest'
import { localTaskPageStore } from './local-task-page-store'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'

afterEach(() => {
  localTaskPageStore.getState().clearTransientUi()
  localTaskSessionPanelStore.getState().close()
})

it('opens task summary for the selected row and closes the session preview', () => {
  localTaskSessionPanelStore.setState({ mode: 'narrow', sessionLinkId: 'session-1' })
  localTaskPageStore.getState().openPreview('task-1')

  expect(localTaskPageStore.getState()).toMatchObject({
    cursorTaskId: 'task-1',
    previewOpen: true,
    detailTaskId: null
  })
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
})

it('keeps the opened task stable on pointer hover but follows keyboard steps and clicks', () => {
  localTaskPageStore.getState().openPreview('task-a')
  localTaskPageStore.getState().setCursor('task-b', 'pointer')
  expect(localTaskPageStore.getState().cursorTaskId).toBe('task-a')

  localTaskPageStore.getState().setCursor('task-b')
  expect(localTaskPageStore.getState().cursorTaskId).toBe('task-b')

  localTaskPageStore.getState().openPreview('task-c')
  expect(localTaskPageStore.getState().cursorTaskId).toBe('task-c')
})

it('returns from detail to the task summary when opened explicitly', () => {
  localTaskPageStore.getState().openDetail('task-a')
  localTaskPageStore.getState().openPreview('task-b')
  expect(localTaskPageStore.getState()).toMatchObject({
    detailTaskId: null,
    cursorTaskId: 'task-b',
    previewOpen: true
  })
})
