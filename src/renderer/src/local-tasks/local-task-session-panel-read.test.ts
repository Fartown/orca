// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { localTaskSessionPanelIsOnScreen } from './local-task-session-panel-read'

afterEach(() => vi.restoreAllMocks())

it('requires a focused, uncovered panel before marking its session read', () => {
  const surface = document.createElement('div')
  const content = document.createElement('div')
  surface.append(content)
  document.body.append(surface)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 10, 100, 100))
  const top = vi.spyOn(document, 'elementFromPoint').mockReturnValue(content)

  expect(localTaskSessionPanelIsOnScreen(surface)).toBe(true)
  top.mockReturnValue(document.body)
  expect(localTaskSessionPanelIsOnScreen(surface)).toBe(false)
  top.mockReturnValue(content)
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  expect(localTaskSessionPanelIsOnScreen(surface)).toBe(false)
  surface.remove()
})
