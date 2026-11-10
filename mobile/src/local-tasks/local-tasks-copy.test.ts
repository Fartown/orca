import { afterEach, describe, expect, it } from 'vitest'
import { activateMobileUiLocale } from '../i18n/mobile-i18n'
import { localTasksCopy } from './local-tasks-copy'

describe('localTasksCopy', () => {
  afterEach(async () => {
    await activateMobileUiLocale('en')
  })

  it('follows a language switch made after the copy was first built', async () => {
    expect(localTasksCopy().work.card.preview).toBe('Preview')

    await activateMobileUiLocale('zh')
    const copy = localTasksCopy()

    expect(copy.back).toBe('返回')
    expect(copy.work.card.preview).toBe('速览')
    expect(copy.work.startWhere('fix-login', 'minizc')).toBe('在 minizc 上新建工作区 fix-login')
    expect(copy.work.card.duration(3 * 60 * 60_000)).toBe('3 小时')
  })
})
