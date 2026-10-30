import { describe, expect, it } from 'vitest'
import { describeLocalTaskLibraryNotices } from './local-task-library-notices'
import { emptyLocalTasksPartition, type LocalTasksPartition } from './local-tasks-partition'

function shownHome(overrides: Partial<LocalTasksPartition>): LocalTasksPartition {
  return {
    ...emptyLocalTasksPartition('local'),
    connection: 'live',
    hostState: 'ready',
    projectsLoaded: true,
    tasksLoaded: true,
    ...overrides
  }
}

function homeNotice(partition: LocalTasksPartition) {
  return describeLocalTaskLibraryNotices([partition], 'local', () => 'Studio')[0]
}

describe('the page’s own library, while its last read stays on screen', () => {
  it('says why its controls are greyed while it reconnects or is out of contact, with no retry', () => {
    expect(homeNotice(shownHome({ connection: 'connecting' }))).toMatchObject({
      tone: 'muted',
      text: 'Reconnecting to the task library. Tasks are shown as last read and can’t be changed until it is back.',
      retry: null
    })
    expect(homeNotice(shownHome({ inContact: false }))).toMatchObject({
      text: 'Studio is not connected. Tasks are shown as last read and can’t be changed until it is back.',
      retry: null
    })
    expect(homeNotice(shownHome({}))).toBeUndefined()
  })
})
