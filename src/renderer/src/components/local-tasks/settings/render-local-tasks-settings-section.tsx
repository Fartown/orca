import { SettingsSection } from '@/components/settings/SettingsSection'
import type { SettingsRenderContext } from '@/components/settings/settings-render-context'
import { translate } from '@/i18n/i18n'
import { LOCAL_TASKS_SETTINGS_SECTION_ID } from './local-tasks-settings-search'
import { LocalTasksSettingsPane } from './LocalTasksSettingsPane'

export function renderLocalTasksSettingsSection(
  context: SettingsRenderContext
): React.JSX.Element | null {
  const { navigation, view } = context
  return (
    <SettingsSection
      id={LOCAL_TASKS_SETTINGS_SECTION_ID}
      title={translate('localTasks.settings.title', 'Local Tasks')}
      description={translate(
        'localTasks.settings.description',
        'Task projects, their repositories, ref prefixes and statuses.'
      )}
      searchEntries={navigation.getSectionSearchEntries(LOCAL_TASKS_SETTINGS_SECTION_ID)}
    >
      {view.isSectionMounted(LOCAL_TASKS_SETTINGS_SECTION_ID) ? <LocalTasksSettingsPane /> : null}
    </SettingsSection>
  )
}
