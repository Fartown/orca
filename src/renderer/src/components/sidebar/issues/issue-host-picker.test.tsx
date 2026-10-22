// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CreateIssueDialog } from './create-issue-dialog'

const rows = vi.hoisted(() =>
  Array.from({ length: 13_692 }, (_, index) => ({
    id: `ssh:node-${index}`,
    label: `node-${String(index).padStart(5, '0')}`
  }))
)
vi.mock('../use-sidebar-host-scope-options', () => ({
  useSidebarHostInventoryOptions: () => rows
}))
afterEach(cleanup)

it('keeps the Issue execution-host picker bounded and reaches a host beyond the first page', async () => {
  render(<CreateIssueDialog open onOpenChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Execution host' }))
  const search = await screen.findByRole('combobox', { name: 'Search hosts…' })
  expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(51)
  fireEvent.change(search, { target: { value: 'node-13691' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.click(screen.getByRole('option', { name: 'node-13691' }))
  expect(screen.getByRole('combobox', { name: 'Execution host' }).textContent).toContain(
    'node-13691'
  )
})
