import { describe, expect, it } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { buildCmdJActionResults, rankCmdJMiddleResults } from '@/components/cmd-j/palette-results'
import {
  CREATE_WORKSPACE_QUICK_ACTION_ID,
  getCmdJQuickActions
} from '@/components/cmd-j/quick-actions'
import { buildLocalTaskPaletteItems } from './local-task-palette-items'

const orca: LocalTaskProject = {
  id: 'orca',
  name: 'Orca',
  prefix: 'ORC',
  aliases: [],
  repos: ['orca-project'],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'todo',
      projectId: 'orca',
      category: 'unstarted',
      name: 'Todo',
      color: 'gray',
      position: 0
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(number: number, title: string, formerRefs?: string[]): LocalTask {
  return {
    id: `orc-${number}`,
    projectId: 'orca',
    number,
    ref: `ORC-${number}`,
    title,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: number,
    updatedAt: number,
    revision: 0,
    ...(formerRefs ? { formerRefs } : {})
  }
}

const library = [task(12, 'Ship notes'), task(1, 'Export orders', ['SHOP-1'])]

function paletteIds(query: string): string[] {
  return buildLocalTaskPaletteItems([orca], library, query).map((item) => item.id)
}

function catalogIds(query: string): string[] {
  return rankCmdJMiddleResults({
    query,
    settingsResults: [],
    actionResults: buildCmdJActionResults(getCmdJQuickActions())
  }).map((result) => result.id)
}

describe('Cmd+J local task results', () => {
  it('ranks a moved task first for its old ref, written plain or zero-padded', () => {
    expect(paletteIds('SHOP-1')[0]).toBe('local-task:orc-1')
    expect(paletteIds('shop-01')[0]).toBe('local-task:orc-1')
    expect(paletteIds('ORC-012')[0]).toBe('local-task:orc-12')
  })

  it('carries the title, project and status a Tasks row prints', () => {
    const [item] = buildLocalTaskPaletteItems([orca], library, 'ship')
    expect(item).toMatchObject({
      type: 'local-task',
      projectName: 'Orca',
      status: { name: 'Todo' },
      hostLabel: null
    })
    expect(item.task.title).toBe('Ship notes')
  })

  it('marks only the rows of a library whose Orca is out of contact as unconfirmed', () => {
    const paired = { ...task(3, 'Ship labels'), id: 'runtime:env-1/orc-3' }
    const items = buildLocalTaskPaletteItems(
      [orca],
      [...library, paired],
      'ship',
      undefined,
      new Set(['runtime:env-1'])
    )
    expect(items.map((item) => [item.task.title, item.unverifiable])).toEqual([
      ['Ship notes', false],
      ['Ship labels', true]
    ])
  })

  it('leaves the upstream action first for the generic verbs it answers to', () => {
    expect(catalogIds('create')).toEqual([CREATE_WORKSPACE_QUICK_ACTION_ID])
    expect(catalogIds('creat')).toEqual([CREATE_WORKSPACE_QUICK_ACTION_ID])
    expect(catalogIds('open')[0]).toBe('new-browser-tab')
    expect(catalogIds('find')).toEqual([])
    expect(catalogIds('new task')[0]).toBe('local-tasks-new')
  })

  it('no longer lists tasks among the actions', () => {
    expect(catalogIds('ship notes')).not.toContain('local-task:orc-12')
  })

  it('answers every keystroke that matches no task with the same empty list', () => {
    expect(buildLocalTaskPaletteItems([orca], library, 'zz')).toBe(
      buildLocalTaskPaletteItems([orca], library, 'zzz')
    )
    expect(buildLocalTaskPaletteItems([orca], library, '')).toBe(
      buildLocalTaskPaletteItems([], [], 'zzz')
    )
  })
})
