import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('lucide-react-native', () => ({ Pencil: 'Pencil', Plus: 'Plus' }))
vi.mock('./local-tasks-list-view', () => ({ LocalTaskSubtaskRow: () => null }))

import { LocalTaskDetailSections } from './local-task-detail-sections'

const task: LocalTask = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  ref: 'ORCA-1',
  title: 'Check the layout',
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

let tree: ReactTestRenderer | null = null
afterEach(() => {
  act(() => tree?.unmount())
  tree = null
})

it('keeps small add actions without rendering empty description and subtask sections', () => {
  const onEdit = vi.fn()
  const onAddSubtask = vi.fn()
  act(() => {
    tree = create(
      createElement(LocalTaskDetailSections, {
        task,
        subtasks: [],
        statuses: new Map(),
        readOnly: false,
        sessionsFor: () => [],
        onEdit,
        onAddSubtask,
        onOpenTask: () => {}
      })
    )
  })
  const labels = tree!.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.props.children)
  expect(labels).toContain('Add description')
  expect(labels).toContain('Add subtask')
  expect(labels).not.toContain('No description')
  const actionRow = tree!.root.findByProps({ testID: 'local-task-detail-empty-actions' })
  const actions = actionRow.findAll((node) => String(node.type) === 'Pressable')
  expect(actions).toHaveLength(2)
  act(() => actions[0].props.onPress())
  act(() => actions[1].props.onPress())
  expect(onEdit).toHaveBeenCalledWith(task)
  expect(onAddSubtask).toHaveBeenCalledWith(task)
})
