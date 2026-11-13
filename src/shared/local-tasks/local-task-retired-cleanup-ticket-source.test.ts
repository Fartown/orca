import { describe, expect, it } from 'vitest'
import { WorkspaceCleanup } from '../rpc-contract/workspace-cleanup-ui-params'
import { normalizeWorkspaceCleanupBrowseState } from '../workspace-cleanup-browse-state'

// Why: builds before REQ-019 was withdrawn saved 'local-task' as a cleanup ticket source.
const savedBrowse = {
  version: 1,
  filters: { ticket: { presence: 'some', sources: ['local-task', 'linear'] } },
  sort: { field: 'size', direction: 'desc' }
}

describe('retired local-task cleanup ticket source', () => {
  it('drops the saved value on startup hydration and keeps the rest of the filter', () => {
    const browse = normalizeWorkspaceCleanupBrowseState(JSON.parse(JSON.stringify(savedBrowse)))

    expect(browse.filters.ticket).toEqual({ presence: 'some', sources: ['linear'] })
    expect(browse.sort).toEqual({ field: 'size', direction: 'desc' })
  })

  it('drops the value when an older client writes it over client-ui RPC', () => {
    const parsed = WorkspaceCleanup.parse({
      dismissals: {},
      browse: { ...savedBrowse, filters: { ticket: { sources: ['local-task'] } } }
    })

    expect(parsed.browse?.filters.ticket.sources).toEqual([])
  })
})
