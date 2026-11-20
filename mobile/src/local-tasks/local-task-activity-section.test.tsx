import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTaskEvent } from '../../../src/shared/local-tasks/local-task-types'
import { createLocalTasksApi } from './local-tasks-api'
import { LocalTaskActivitySection } from './local-task-activity-section'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(async () => {}) },
  Platform: { OS: 'ios' },
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight',
  Pencil: 'Pencil',
  Send: 'Send',
  Trash2: 'Trash2',
  X: 'X'
}))
vi.mock('../components/sheets/ActionSheetModal', () => ({ ActionSheetModal: () => null }))
vi.mock('../components/sheets/ConfirmModal', () => ({ ConfirmModal: () => null }))
vi.mock('../components/mermaid/MermaidDiagram', () => ({ MermaidDiagram: () => null }))
vi.mock('../components/code-presentation/MobileSourceCopyButton', () => ({
  MobileSourceCopyButton: () => null
}))

let tree: ReactTestRenderer | null = null
afterEach(() => {
  act(() => tree?.unmount())
  tree = null
})

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')
}

function event(id: string, body: string, progress: boolean): LocalTaskEvent {
  return {
    id,
    taskId: 'task',
    kind: 'comment',
    source: 'cli',
    body,
    payload: progress ? { progress: true } : null,
    createdAt: 1,
    editedAt: null
  }
}

it('renders a marked writeback as Markdown and leaves an ordinary comment literal', () => {
  act(() => {
    tree = create(
      createElement(LocalTaskActivitySection, {
        api: createLocalTasksApi({ sendRequest: vi.fn() }),
        taskId: 'task',
        events: {
          events: [
            event('progress', '## Result\n\n**Done** with `CSV`', true),
            event('plain', '**literal**', false)
          ],
          loaded: true,
          error: false,
          retry: () => {}
        },
        statuses: new Map(),
        tasksById: new Map(),
        now: 100,
        readOnly: true,
        canRead: true,
        onChanged: () => {}
      })
    )
  })
  const text = tree!.root.findAll((node) => String(node.type) === 'Text')
  const heading = text.find((node) => textOf(node) === 'Result')
  const bold = text.find((node) => textOf(node) === 'Done')
  const code = text.find((node) => textOf(node) === 'CSV')
  expect(heading?.props.style.flat(Infinity)).toContainEqual(
    expect.objectContaining({ fontWeight: '700' })
  )
  expect(bold?.props.style.flat(Infinity)).toContainEqual(
    expect.objectContaining({ fontWeight: '700' })
  )
  expect(code?.props.style.flat(Infinity)).toContainEqual(
    expect.objectContaining({ fontFamily: expect.any(String) })
  )
  expect(text.some((node) => textOf(node) === '**literal**')).toBe(true)
})
