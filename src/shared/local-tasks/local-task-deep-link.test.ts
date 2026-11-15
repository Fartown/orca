import { describe, expect, it } from 'vitest'
import {
  localTaskDeepLink,
  localTaskDeepLinkFromArguments,
  parseLocalTaskDeepLink
} from './local-task-deep-link'

describe('local task deep links', () => {
  it('round trips the owning local or paired library and its own task id', () => {
    for (const target of [
      { endpoint: 'local' as const, taskId: 'same-id' },
      { endpoint: 'runtime:env-1' as const, taskId: 'same-id' },
      { endpoint: 'runtime:env-2' as const, taskId: 'id with space' }
    ]) {
      expect(parseLocalTaskDeepLink(localTaskDeepLink(target))).toEqual(target)
    }
  })

  it('refuses ambiguous or unrelated links', () => {
    for (const link of [
      'orca://tasks/v1/local/SHOP-1?other=1',
      'orca://tasks/v1/local/a%2Fb',
      'orca://tasks/v1/runtime%3Aenv-1/',
      'orca://skills/share/abc',
      'orca://tasks/v1/ssh%3Ahost/task'
    ]) {
      expect(parseLocalTaskDeepLink(link)).toBeNull()
    }
  })

  it('forwards malformed task URLs for a visible error while leaving other Orca URLs alone', () => {
    const malformed = 'orca://tasks/v1/local/a%2Fb'
    expect(parseLocalTaskDeepLink(malformed)).toBeNull()
    expect(localTaskDeepLinkFromArguments(['Orca', 'orca://pair?code=x', malformed])).toBe(
      malformed
    )
    expect(localTaskDeepLinkFromArguments(['Orca', 'orca://pair?code=x'])).toBeNull()
    expect(localTaskDeepLinkFromArguments(['Orca', 'orca://skills/share/abc'])).toBeNull()
    expect(localTaskDeepLinkFromArguments(['Orca', 'orca://tasks-other/v1/local/id'])).toBeNull()
  })
})
