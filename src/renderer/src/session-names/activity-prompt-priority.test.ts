import { expect, it } from 'vitest'
import { activityThreadMatchesSearchQuery } from '../components/activity/thread-list/activity-thread-grouping'
import {
  makeActivityResult,
  makeTab,
  makeThreads,
  makeWorkingEntryWithoutHistory,
  PANE_KEY
} from './activity-test-fixtures'

// Fork (session-names): moved from ActivityPrototypePage.test.ts, which upstream #38292 removed.
it('keeps prompt search while a stable prompt outranks a container alias', () => {
  const tab = { ...makeTab(), customTitle: 'Pinned agent title' }
  const entry = {
    ...makeWorkingEntryWithoutHistory(),
    prompt: 'Investigate activity live prompt search'
  }

  const threads = makeThreads(makeActivityResult({ entries: { [PANE_KEY]: entry }, tab }))

  expect(threads[0].paneTitle).toBe('Investigate activity live prompt search')
  expect(
    activityThreadMatchesSearchQuery({ thread: threads[0], searchQuery: 'live prompt search' })
  ).toBe(true)
})
