import { describe, expect, it } from 'vitest'
import { normalizeRightSidebarRoute } from './right-sidebar-route'

describe('normalizeRightSidebarRoute', () => {
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

  it('preserves well-formed plugin panel tabs', () => {
    expect(normalizeRightSidebarRoute('plugin:samples.my-plugin/dashboard')).toEqual({
      rightSidebarTab: 'plugin:samples.my-plugin/dashboard',
      rightSidebarExplorerView: 'files'
    })
  })

  it('drops a well-formed tab once the installed plugin list proves it is stale', () => {
    expect(
      normalizeRightSidebarRoute('plugin:samples.removed/dashboard', undefined, {
        installedPluginTabKeys: new Set(['plugin:samples.present/dashboard'])
      })
    ).toEqual({
      rightSidebarTab: 'explorer',
      rightSidebarExplorerView: 'files'
    })
  })
})
