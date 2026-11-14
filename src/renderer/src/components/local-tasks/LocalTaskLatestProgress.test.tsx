// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskLatestProgressCard, LocalTaskLatestProgressLine } from './LocalTaskLatestProgress'

const task: LocalTask = {
  id: 't-1',
  projectId: 'p',
  number: 1,
  ref: 'SHOP-1',
  title: 'Add CSV export',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

afterEach(cleanup)

describe('latest progress on a task', () => {
  it('shows what the agent needs before its result', () => {
    render(
      <LocalTaskLatestProgressCard
        task={{
          ...task,
          latestProgress: {
            kind: 'progress',
            body: 'Added the CSV button; tests pass.',
            at: 1_700_000_000_000,
            sessionLinkId: 's-1',
            needsYou: 'Pick the column order'
          }
        }}
      />
    )
    expect(screen.getByText('Needs you: Pick the column order')).toBeTruthy()
    expect(screen.getByText('Added the CSV button; tests pass.')).toBeTruthy()
  })

  it('shows nothing for a task no agent wrote back on', () => {
    const { container } = render(
      <>
        <LocalTaskLatestProgressCard task={task} />
        <LocalTaskLatestProgressLine task={task} />
      </>
    )
    expect(container.textContent).toBe('')
  })

  it('renders Markdown and lets a long writeback expand', () => {
    render(
      <LocalTaskLatestProgressCard
        task={{
          ...task,
          latestProgress: {
            kind: 'progress',
            body: `**Done**\n\n${'More detail. '.repeat(40)}`,
            at: 1_700_000_000_000,
            sessionLinkId: null
          }
        }}
      />
    )
    expect(screen.getByText('Done').tagName).toBe('STRONG')
    const expand = screen.getByRole('button', { name: 'Show more' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
      'true'
    )
  })

  it('shows a readable writeback excerpt without Markdown syntax', () => {
    const { container } = render(
      <LocalTaskLatestProgressLine
        task={{
          ...task,
          latestProgress: {
            kind: 'progress',
            body: '## Completed - **Invoice export**\n\n- Added `CSV` output',
            at: 1_700_000_000_000,
            sessionLinkId: null
          }
        }}
      />
    )
    expect(container.textContent).toBe('Completed - Invoice export Added CSV output')
  })
})
