import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { activateMobileUiLocale } from '../i18n/mobile-i18n'
import { LocalTaskNowCard } from './local-task-now-card'
import { localTasksCopy } from './local-tasks-copy'

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
vi.mock('../components/markdown/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('../agents/presentation/AgentStateDot', () => ({ AgentStateDot: () => null }))

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

function renderBody(body: string, id = 'one', descendants: LocalTask[] = [], ownProgress = true) {
  const current = {
    ...task,
    id,
    latestProgress: ownProgress
      ? { kind: 'progress' as const, body, at: 1, sessionLinkId: null }
      : undefined
  }
  return createElement(LocalTaskNowCard, {
    task: current,
    descendants,
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

function renderSessionSummary(
  lastMessage: string,
  progressBody: string | null = null,
  options?: {
    onOpenSession?: (id: string) => void
    onLongPressSession?: (id: string) => void
    sessionTask?: LocalTask
  }
) {
  const link: LocalTaskSessionLink = {
    id: 'session-1',
    taskId: task.id,
    hostId: 'local',
    worktreeId: 'worktree-1',
    instanceId: null,
    surface: 'terminal',
    tabId: 'tab-1',
    paneKey: 'tab-1:leaf-1',
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1
  }
  return createElement(LocalTaskNowCard, {
    task:
      progressBody !== null
        ? {
            ...task,
            latestProgress: {
              kind: 'progress' as const,
              body: progressBody,
              at: 1,
              sessionLinkId: link.id
            }
          }
        : task,
    descendants: [],
    facts: {
      workspace: null,
      hostName: '',
      offline: false,
      lead: null,
      sessionCount: 1,
      latest: null,
      subtasks: null
    },
    writebacks: [],
    sessions: [{ link, task: options?.sessionTask ?? task, state: 'done' as const, lastMessage }],
    links: { workspaces: [], sessions: [link] },
    snapshot: null,
    now: 100,
    onOpenSession: options?.onOpenSession ?? (() => {}),
    onLongPressSession: options?.onLongPressSession ?? null
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
    expect(tree!.root.find((node) => String(node.type) === 'MobileMarkdown').props.density).toBe(
      'tight'
    )
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
    measure(90)
    expect(toggle().props.accessibilityState.expanded).toBe(false)
    act(() => toggle().props.onPress())
    expect(clip().props.style[1]).toBe(false)
    expect(toggle().props.accessibilityState.expanded).toBe(true)
    expect(tree!.root.find((node) => String(node.type) === 'MobileMarkdown').props.density).toBe(
      undefined
    )
    act(() => toggle().props.onPress())
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
    expect(tree!.root.find((node) => String(node.type) === 'MobileMarkdown').props.density).toBe(
      'tight'
    )
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

  it('folds when navigating from a parent preview to the child that wrote the same progress', () => {
    const child: LocalTask = {
      ...task,
      id: 'child',
      parentId: 'parent',
      latestProgress: { kind: 'progress', body: 'same long progress', at: 1, sessionLinkId: null }
    }
    act(() => {
      tree = create(renderBody(child.latestProgress!.body, 'parent', [child], false))
    })
    measure(90)
    act(() => toggle().props.onPress())
    act(() => tree!.update(renderBody(child.latestProgress!.body, child.id)))
    expect(clip().props.style[1]).toEqual({ maxHeight: 63 })
    measure(90)
    expect(toggle().props.accessibilityState.expanded).toBe(false)
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

describe('mobile task session summary', () => {
  it('keeps identity, state and summary in separate lines with the status dot and arrow beside identity', () => {
    const child = { ...task, id: 'child', title: 'A long child task title', parentId: task.id }
    act(() => {
      tree = create(renderSessionSummary('Latest session summary', null, { sessionTask: child }))
    })
    const row = tree!.root.findByProps({ testID: 'local-task-session-session-1' })
    const columns = row.findAll((node) => String(node.type) === 'View' && node.parent === row)
    expect(columns).toHaveLength(3)
    const content = columns[1]
    const identity = content.findAll(
      (node) => String(node.type) === 'View' && node.parent === content
    )[0]
    expect(
      identity.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children)
    ).toEqual(expect.arrayContaining(['Claude', 'Terminal', 'A long child task title']))
    expect(
      content
        .findAll((node) => String(node.type) === 'Text' && node.parent === content)
        .map((node) => node.props.children)
    ).toEqual([localTasksCopy().work.sessionStates.done, 'Latest session summary'])
    expect(columns[2].findAll((node) => String(node.type) === 'ChevronRight')).toHaveLength(1)
  })

  it('opens and unlinks the exact session from the row', () => {
    const onOpenSession = vi.fn()
    const onLongPressSession = vi.fn()
    act(() => {
      tree = create(renderSessionSummary('Last line', null, { onOpenSession, onLongPressSession }))
    })
    const row = tree!.root.findByProps({ testID: 'local-task-session-session-1' })
    act(() => row.props.onPress())
    act(() => row.props.onLongPress())
    expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('session-1')
    expect(onLongPressSession).toHaveBeenCalledExactlyOnceWith('session-1')
  })

  it('shows readable prose from markdown without link syntax or code markers', () => {
    act(() => {
      tree = create(
        renderSessionSummary(
          'Read [the report](https://example.com/report) and `run tests` **today**.'
        )
      )
    })
    const row = tree!.root.findByProps({ testID: 'local-task-session-session-1' })
    const lines = row.findAll((node) => String(node.type) === 'Text')
    expect(lines.map((line) => line.props.children)).toContain(
      'Read the report and run tests today.'
    )
  })

  it('keeps the exact session row clickable when its latest line repeats the progress above', () => {
    act(() => {
      const body = '**Finished** [the report](https://example.com)'
      tree = create(renderSessionSummary(body, body))
    })
    const row = tree!.root.findByProps({ testID: 'local-task-session-session-1' })
    expect(row.props.accessibilityRole).toBe('button')
    expect(
      row.findAll(
        (node) => String(node.type) === 'Text' && node.props.children === 'Finished the report'
      )
    ).toHaveLength(0)
    expect(tree!.root.findByProps({ testID: 'local-task-progress-clip' })).toBeDefined()
  })

  it('keeps a session summary when long progress has the same first 160 characters but a different ending', () => {
    const prefix = 'a'.repeat(170)
    act(() => {
      tree = create(renderSessionSummary(`${prefix} session ending`, `${prefix} progress ending`))
    })
    const row = tree!.root.findByProps({ testID: 'local-task-session-session-1' })
    expect(
      row.findAll(
        (node) => String(node.type) === 'Text' && node.props.children === `${'a'.repeat(160)}…`
      )
    ).toHaveLength(1)
  })
})

describe('mobile task empty progress', () => {
  it('shows a compact empty line without an empty card section', () => {
    act(() => {
      tree = create(renderBody('', 'one', [], false))
    })
    const empty = tree!.root.findByProps({ testID: 'local-task-now-card' })
    expect(empty.findAll((node) => String(node.type) === 'View')).toHaveLength(1)
    expect(
      empty.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children)
    ).toEqual(['No writeback yet'])
  })
})
