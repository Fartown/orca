import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { activateMobileUiLocale } from '../i18n/mobile-i18n'
import { LocalTaskNowCard } from './local-task-now-card'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight',
  CircleDot: 'CircleDot',
  CornerDownRight: 'CornerDownRight',
  List: 'List'
}))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('../components/AgentStateDot', () => ({ AgentStateDot: () => null }))

const task: LocalTask = {
  id: 'one',
  projectId: 'p',
  number: 1,
  ref: 'P-1',
  title: 'One',
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

afterEach(async () => {
  if (tree) {
    act(() => tree?.unmount())
  }
  tree = null
  await activateMobileUiLocale('en')
})

function renderBody(body: string, id = 'one') {
  const current = {
    ...task,
    id,
    latestProgress: { kind: 'progress' as const, body, at: 1, sessionLinkId: null }
  }
  return createElement(LocalTaskNowCard, {
    task: current,
    descendants: [],
    facts: {
      workspace: null,
      hostName: '',
      offline: false,
      lead: null,
      sessionCount: 0,
      latest: null,
      subtasks: null
    },
    writebacks: [],
    sessions: [],
    links: { workspaces: [], sessions: [] },
    snapshot: null,
    now: 100,
    onOpenSession: () => {},
    onLongPressSession: null
  })
}

function clip() {
  return tree!.root.findByProps({ testID: 'local-task-progress-clip' })
}
function toggle() {
  return tree!.root.findByProps({ testID: 'local-task-progress-toggle' })
}
function toggleText() {
  return toggle().find((node) => String(node.type) === 'Text').props.children
}
function measure(height: number) {
  const content = clip()
    .findAll((node) => String(node.type) === 'View')
    .find((node) => node.props.onLayout)
  act(() => content!.props.onLayout({ nativeEvent: { layout: { height } } }))
}

describe('mobile task progress body', () => {
  it('renders Markdown, folds measured overflow, expands and folds again', () => {
    act(() => {
      tree = create(renderBody('**Done** with [details](https://example.com)'))
    })
    expect(tree!.root.find((node) => String(node.type) === 'MobileMarkdown').props.content).toBe(
      '**Done** with [details](https://example.com)'
    )
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
    measure(90)
    expect(toggle().props.accessibilityState.expanded).toBe(false)
    act(() => toggle().props.onPress())
    expect(clip().props.style[1]).toBe(false)
    expect(toggle().props.accessibilityState.expanded).toBe(true)
    act(() => toggle().props.onPress())
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
  })

  it('hides the control when text fits and resets on another task', () => {
    act(() => {
      tree = create(renderBody('short'))
    })
    measure(42)
    expect(tree!.root.findAllByProps({ testID: 'local-task-progress-toggle' })).toHaveLength(0)
    measure(90)
    act(() => toggle().props.onPress())
    act(() => tree!.update(renderBody('another long body', 'two')))
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
    expect(tree!.root.findAllByProps({ testID: 'local-task-progress-toggle' })).toHaveLength(0)
  })

  it('updates the disclosure labels when the mobile language changes', async () => {
    act(() => {
      tree = create(renderBody('long body'))
    })
    measure(90)
    expect(toggleText()).toBe('Show more')
    await act(async () => activateMobileUiLocale('zh'))
    expect(toggleText()).toBe('展开更多')
    act(() => toggle().props.onPress())
    expect(toggleText()).toBe('收起')
    await act(async () => activateMobileUiLocale('en'))
    expect(toggleText()).toBe('Show less')
  })
})
