import { describe, expect, it } from 'vitest'
import { parseLocalTaskProgressSections } from './local-task-progress-sections'

describe('parseLocalTaskProgressSections', () => {
  it('reads labelled lines in either colon width, joining a wrapped line to its label', () => {
    expect(
      parseLocalTaskProgressSections(
        '做了什么：已复现\n结论: attach 时序\n继续看日志\n下一步：写回归测试'
      )
    ).toEqual([
      { label: '做了什么', text: '已复现' },
      { label: '结论', text: 'attach 时序\n继续看日志' },
      { label: '下一步', text: '写回归测试' }
    ])
  })

  it('keeps an unlabelled opening as a row of its own, so later labels still read', () => {
    expect(
      parseLocalTaskProgressSections('导出接口已完成。\n自检：10 万行 18 秒\n验收：订单列表')
    ).toEqual([
      { label: '', text: '导出接口已完成。' },
      { label: '自检', text: '10 万行 18 秒' },
      { label: '验收', text: '订单列表' }
    ])
  })

  it('leaves free text as one block', () => {
    expect(parseLocalTaskProgressSections('Fixed the reconnect race and added a test.')).toBeNull()
    expect(parseLocalTaskProgressSections('see https://example.com: details')).toBeNull()
  })
})
