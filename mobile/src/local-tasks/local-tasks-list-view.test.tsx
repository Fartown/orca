import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { localTasksCopy } from './local-tasks-copy'
import { buildLocalTaskGroups, localTaskStatusLookup } from './local-task-list-projection'
import { LocalTasksListView } from './local-tasks-list-view'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  Bell: 'Bell',
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight'
}))
vi.mock('./local-task-card', () => ({
  LocalTaskCard: 'LocalTaskCard',
  localTaskCardStyles: { group: {} }
}))
vi.mock('./local-task-session-dots', () => ({ LocalTaskSessionDots: 'LocalTaskSessionDots' }))
vi.mock('./local-tasks-visuals', () => ({
  LocalTaskStatusIcon: 'LocalTaskStatusIcon',
  localTaskCategoryColor: () => 'gray'
}))

const project: LocalTaskProject = {
  id: 'p',
  name: 'P',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'doing',
      projectId: 'p',
      name: 'Doing',
      category: 'started',
      color: 'yellow',
      position: 0
    },
    { id: 'todo', projectId: 'p', name: 'Todo', category: 'unstarted', color: 'green', position: 1 }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(id: string, statusId: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'p',
    number: 1,
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

it('heads each status with the tasks of that status shown below, plus those in "Needs you"', () => {
  // A waits in "Needs you" and takes its Todo subtask A1 along; B stays below.
  const tasks = [task('A', 'doing'), task('A1', 'todo', 'A'), task('B', 'doing'), task('C', 'todo')]
  const groups = buildLocalTaskGroups({
    tasks,
    projects: [project],
    projectId: 'p',
    segment: 'all',
    nestSubtasks: true,
    keepEmpty: false
  })
  act(() => {
    renderer = create(
      createElement(LocalTasksListView, {
        groups,
        lookup: localTaskStatusLookup([project]),
        now: 0,
        bottomInset: 0,
        sessionsFor: () => [],
        factsFor: () => ({
          workspace: null,
          hostName: '',
          offline: false,
          lead: null,
          sessionCount: 0,
          latest: null,
          subtasks: null
        }),
        band: { ids: new Set(['A', 'A1']), count: 1, note: null, section: null },
        onOpen: vi.fn()
      })
    )
  })
  const texts = renderer!.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.props.children)
  const more = localTasksCopy().work.card.moreInNeedsYou
  expect(texts).toEqual(expect.arrayContaining(['Doing', 1, more(1), 'Todo', 1]))
  expect(texts.filter((text) => text === more(1))).toHaveLength(2)
})
