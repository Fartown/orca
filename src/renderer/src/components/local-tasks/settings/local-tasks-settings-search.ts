import { ListTodo } from 'lucide-react'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '@/components/settings/settings-search-keywords'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'

export const LOCAL_TASKS_SETTINGS_SECTION_ID = 'local-tasks'

export const getLocalTasksSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('localTasks.settings.projectsTitle', 'Task projects'),
    description: translate(
      'localTasks.settings.projectsSearchDescription',
      'Create task projects, rename them and change their ref prefix.'
    ),
    keywords: [
      ...translateSearchKeyword('localTasks.settings.keywordTasks', 'tasks'),
      ...translateSearchKeyword('localTasks.settings.keywordProject', 'project'),
      ...translateSearchKeyword('localTasks.settings.keywordPrefix', 'prefix')
    ]
  },
  {
    title: translate('localTasks.settings.statusesTitle', 'Statuses'),
    description: translate(
      'localTasks.settings.statusesSearchDescription',
      'Add, rename, recolor, reorder and remove the statuses in each category.'
    ),
    keywords: [
      ...translateSearchKeyword('localTasks.settings.keywordStatus', 'status'),
      ...translateSearchKeyword('localTasks.settings.keywordBoard', 'board')
    ]
  }
])

/** Section metadata; browser clients cannot reach this desktop's task library. */
export function getLocalTasksSettingsSections({
  isWebClient
}: {
  isWebClient: boolean
}): SettingsNavSection[] {
  if (isWebClient) {
    return []
  }
  return [
    {
      id: LOCAL_TASKS_SETTINGS_SECTION_ID,
      title: translate('localTasks.settings.title', 'Local Tasks'),
      description: translate(
        'localTasks.settings.description',
        'Task projects, ref prefixes and statuses for tasks kept on this computer.'
      ),
      icon: ListTodo,
      searchEntries: getLocalTasksSettingsSearchEntries(),
      group: 'workflows'
    }
  ]
}
