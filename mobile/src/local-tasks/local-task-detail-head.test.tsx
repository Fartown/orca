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
vi.mock('lucide-react-native', () => ({
  CornerDownRight: 'CornerDownRight',
  GitBranch: 'GitBranch',
  Plus: 'Plus'
}))

import { LocalTaskDetailWhere } from './local-task-detail-head'

const parent: LocalTask = {
  id: 'parent',
  projectId: 'project',
  number: 3,
  ref: 'ORCA-3',
  title: 'Parent',
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

it('keeps workspace and offline facts while showing the inherited task only once', () => {
  act(() => {
    tree = create(
      createElement(LocalTaskDetailWhere, {
        facts: {
          workspace: {
            name: 'A very long workspace name that must not hide host facts',
            hostId: 'ssh:desk'
          },
          hostName: 'Remote desk',
          offline: true,
          lead: null,
          sessionCount: 0,
          latest: null,
          subtasks: null
        },
        reviewDetail: 'PR #28 needs review',
        inheritedFrom: parent,
        primary: { label: 'New session', disabled: true, onPress: () => {} },
        notices: createElement('Text', null, 'Host not connected'),
        readOnly: false
      })
    )
  })
  const labels = tree!.root
    .findAll((node) => String(node.type) === 'Text')
    .flatMap((node) => (typeof node.props.children === 'string' ? [node.props.children] : []))
  expect(labels).toContain('A very long workspace name that must not hide host facts')
  expect(labels).toContain('Remote desk not connected')
  expect(labels).toContain('PR #28 needs review')
  expect(labels).toContain('From Parent')
  expect(labels).toContain('Host not connected')
  const textColumn = tree!.root.findByProps({ testID: 'local-task-detail-where-text' })
  const facts = textColumn.findAll((node) => String(node.type) === 'Text')
  expect(facts.map((node) => node.props.children)).toEqual([
    'A very long workspace name that must not hide host facts',
    'Remote desk not connected',
    'PR #28 needs review',
    'From Parent'
  ])
  expect(facts[0].props.numberOfLines).toBe(1)
  expect(facts[1].props.numberOfLines).toBeUndefined()
  expect(tree!.root.findByProps({ testID: 'local-task-detail-primary' }).props.disabled).toBe(true)
})
