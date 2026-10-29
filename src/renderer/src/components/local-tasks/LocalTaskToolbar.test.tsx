// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskToolbar } from './LocalTaskToolbar'
import { useLocalTaskListModel } from './use-local-task-list-model'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('./LocalTaskFilterPopover', () => ({ LocalTaskFilterPopover: () => null }))
vi.mock('./LocalTaskViewOptions', () => ({ LocalTaskViewOptions: () => null }))

function Toolbar(): React.JSX.Element {
  return (
    <TooltipProvider>
      <LocalTaskToolbar model={useLocalTaskListModel()} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  localTaskPageStore.setState({
    searchFocusRequest: 0,
    consumedSearchFocusRequest: 0
  })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
})
afterEach(cleanup)

it('focuses one requested search once across remounts', () => {
  localTaskPageStore.getState().requestSearchFocus()
  const view = render(<Toolbar />)
  const search = screen.getByRole('textbox', { name: 'Search tasks' })
  expect(document.activeElement).toBe(search)
  search.blur()
  view.unmount()
  render(<Toolbar />)
  expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Search tasks' }))
})
