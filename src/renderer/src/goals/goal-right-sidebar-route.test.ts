import { describe, expect, it } from 'vitest'
import { normalizeRightSidebarRoute } from '@/store/slices/right-sidebar/right-sidebar-route'

describe('the native goals tab in the right sidebar route', () => {
  it('keeps the native goals tab', () => {
    expect(normalizeRightSidebarRoute('goals')).toEqual({
      rightSidebarTab: 'goals',
      rightSidebarExplorerView: 'files'
    })
  })

  it('routes the removed Goal plugin tab onto the native goals tab', () => {
    expect(
      normalizeRightSidebarRoute('plugin:stablyai.orca-goal/goal', undefined, {
        installedPluginTabKeys: new Set()
      })
    ).toEqual({
      rightSidebarTab: 'goals',
      rightSidebarExplorerView: 'files'
    })
  })
})
