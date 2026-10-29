import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import {
  buildCmdJActionResults,
  buildCmdJSettingsResults,
  rankCmdJMiddleResults
} from '@/components/cmd-j/palette-results'
import { getCmdJQuickActions } from '@/components/cmd-j/quick-actions'
import {
  getSettingsSectionSearchEntries,
  rankSettingsSearchItems
} from '@/components/settings/settings-search'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { LOCAL_TASKS_SETTINGS_SECTION_ID } from './local-tasks-settings-search'

const sections = buildSettingsNavigationMetadata({
  isMac: true,
  isWindows: false,
  isWebClient: false,
  repos: []
})
const upstreamSections = sections.filter(
  (section) => section.id !== LOCAL_TASKS_SETTINGS_SECTION_ID
)

function cmdJFirst(query: string, list: readonly SettingsNavSection[]): string | undefined {
  const actions = getCmdJQuickActions().filter(
    (action) => list === sections || !action.id.startsWith('local-tasks-')
  )
  return rankCmdJMiddleResults({
    query,
    settingsResults: buildCmdJSettingsResults(list),
    actionResults: buildCmdJActionResults(actions)
  })[0]?.id
}

function settingsPageFirst(query: string, list: readonly SettingsNavSection[]): string | undefined {
  return rankSettingsSearchItems(query, list, getSettingsSectionSearchEntries)[0]?.item.id
}

describe('Local Tasks settings search', () => {
  it.each(['status', 'local'])('leaves the first Cmd+J result for %s where it was', (query) => {
    expect(cmdJFirst(query, sections)).toBe(cmdJFirst(query, upstreamSections))
  })

  it('leaves the first Settings result for a bare status search where it was', () => {
    expect(settingsPageFirst('status', sections)).toBe(
      settingsPageFirst('status', upstreamSections)
    )
  })

  it('is still found by its own name', () => {
    expect(cmdJFirst('local tasks', sections)).toBe(`settings:${LOCAL_TASKS_SETTINGS_SECTION_ID}`)
    expect(settingsPageFirst('local tasks', sections)).toBe(LOCAL_TASKS_SETTINGS_SECTION_ID)
  })
})
