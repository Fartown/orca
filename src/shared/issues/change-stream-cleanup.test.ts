import { describe, expect, it } from 'vitest'
import { getCleanupRequest } from '../remote-runtime-shared-control-protocol'
import { createSharedControlSubscription } from '../remote-runtime-shared-control-subscriptions'
import {
  ISSUE_CHANGES_SUBSCRIBE_METHOD,
  ISSUE_CHANGES_UNSUBSCRIBE_METHOD,
  IssuesUnsubscribeChangesParams
} from './change-stream-schemas'

describe('Issue change stream over shared control', () => {
  it('cancels by the client request id, so a close before ready still reaches the host', () => {
    const subscription = createSharedControlSubscription({
      requestId: 'request-1',
      method: ISSUE_CHANGES_SUBSCRIBE_METHOD,
      params: undefined,
      retainedParamsBytes: 0,
      callbacks: { onResponse: () => {}, onError: () => {} }
    })

    const cleanup = getCleanupRequest(subscription)

    expect(cleanup).toEqual({
      method: ISSUE_CHANGES_UNSUBSCRIBE_METHOD,
      params: { subscriptionId: 'request-1' }
    })
    expect(IssuesUnsubscribeChangesParams.safeParse(cleanup?.params).success).toBe(true)
  })
})
