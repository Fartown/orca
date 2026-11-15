// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskProgressBody } from './LocalTaskFactRows'
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function measureProgress(height: number): void {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(height)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
}

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
    measureProgress(100)
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
    expect(expand.previousElementSibling?.className).toContain('max-h-[3.75rem]')
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy()
  })

  it('does not show a disclosure when the rendered body fits, even with many characters', () => {
    measureProgress(60)
    render(
      <LocalTaskLatestProgressCard
        task={{
          ...task,
          latestProgress: { kind: 'progress', body: 'a'.repeat(500), at: 1, sessionLinkId: null }
        }}
      />
    )
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('folds a new task body after expanding the previous one', () => {
    measureProgress(100)
    const progress = (body: string, id: string): LocalTask => ({
      ...task,
      id,
      latestProgress: { kind: 'progress', body, at: 1, sessionLinkId: null }
    })
    const { rerender } = render(
      <LocalTaskLatestProgressCard task={progress('first long body', 'one')} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    rerender(<LocalTaskLatestProgressCard task={progress('second long body', 'two')} />)
    expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('does not restore an old expansion after body A changes to B and back without remounting', () => {
    measureProgress(100)
    const { rerender } = render(<LocalTaskProgressBody body="body A" sections={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    rerender(<LocalTaskProgressBody body="body B" sections={null} />)
    expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
      'false'
    )
    rerender(<LocalTaskProgressBody body="body A" sections={null} />)
    expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
      'false'
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
