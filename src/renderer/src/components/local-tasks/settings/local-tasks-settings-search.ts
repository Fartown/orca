import { ListTodo } from 'lucide-react'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '@/components/settings/settings-search-keywords'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'

export const LOCAL_TASKS_SETTINGS_SECTION_ID = 'local-tasks'

export const getLocalTasksSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('localTasks.settings.projectsTitle', 'Projects'),
    description: translate(
      'localTasks.settings.projectsSearchDescription',
      'Create projects, link repositories, rename them and change their ref prefix.'
    ),
    keywords: [
      ...translateSearchKeyword('localTasks.settings.keywordTasks', 'tasks'),
      ...translateSearchKeyword('localTasks.settings.keywordProject', 'project'),
      ...translateSearchKeyword('localTasks.settings.keywordPrefix', 'prefix')
    ]
  },
  {
    // Why not the pane's "Statuses" heading: a bare `status` search would rank it above upstream's.
    title: translate('localTasks.settings.statusesSearchTitle', 'Task statuses'),
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

/** Section metadata; a browser client manages the task library of the host it is paired with. */
export function getLocalTasksSettingsSections(): SettingsNavSection[] {
  return [
    {
      id: LOCAL_TASKS_SETTINGS_SECTION_ID,
      title: translate('localTasks.settings.title', 'Local tasks'),
      description: translate(
        'localTasks.settings.description',
        'Projects, their repositories, ref prefixes and statuses.'
      ),
      icon: ListTodo,
      searchEntries: getLocalTasksSettingsSearchEntries(),
      group: 'workflows'
    }
  ]
}
