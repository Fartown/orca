import { describe, expect, it } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskSearchActions } from '@/components/cmd-j/local-task-quick-actions'
import { buildCmdJActionResults, rankCmdJMiddleResults } from '@/components/cmd-j/palette-results'

const orca: LocalTaskProject = {
  id: 'orca',
  name: 'Orca',
  prefix: 'ORC',
  aliases: [],
  repos: ['orca-project'],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
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
  const actions = buildLocalTaskSearchActions([orca], library, query)
  return rankCmdJMiddleResults({
    query,
    settingsResults: [],
    actionResults: buildCmdJActionResults(actions)
  }).map((result) => result.id)
}

describe('Cmd+J local task search', () => {
  it('ranks a moved task first for its old ref, written plain or zero-padded', () => {
    expect(paletteIds('SHOP-1')[0]).toBe('local-task:orc-1')
    expect(paletteIds('shop-01')[0]).toBe('local-task:orc-1')
    expect(paletteIds('ORC-012')[0]).toBe('local-task:orc-12')
  })
})
