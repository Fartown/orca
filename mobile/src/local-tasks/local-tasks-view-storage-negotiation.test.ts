import { describe, expect, it } from 'vitest'
import { createPageClient } from '../fork-test-support/mobile-web-shell/bridge/test-support/bridge-page-client-test-harness'
import { pageReadsStorageKey } from '../mobile-web-shell/page-storage/page-storage-keys'

describe('the local tasks view preference on a served page', () => {
  it('is named in ready, so the host hands the page its stored view back', () => {
    const [ready] = createPageClient().frames()
    expect(ready).toMatchObject({
      type: 'ready',
      storageKeys: expect.arrayContaining(['orca:localTasksView'])
    })
  })

  it('stays out of init for an older page that never declared it', () => {
    expect(pageReadsStorageKey('orca:localTasksView', null)).toBe(false)
  })
})
