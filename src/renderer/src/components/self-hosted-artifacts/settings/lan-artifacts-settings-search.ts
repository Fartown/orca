import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '@/components/settings/settings-search-keywords'

export const getLanArtifactsSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate(
      'auto.components.selfHostedArtifacts.settings.allowSharing',
      'Share on local network from this computer'
    ),
    description: translate(
      'auto.components.selfHostedArtifacts.settings.allowSharingSearchDescription',
      'Let this computer serve links to files in its workspaces while Orca is open.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordArtifacts', 'artifacts'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordShare', 'share'),
      ...translateSearchKeyword(
        'auto.components.selfHostedArtifacts.settings.keywordLocalNetwork',
        'local network'
      ),
      ...translateSearchKeyword('auto.components.selfHostedArtifacts.settings.keywordLan', 'LAN', {
        englishOnly: true
      }),
      ...translateSearchKeyword(
        'auto.components.settings.artifacts.keywordPermission',
        'permission'
      )
    ]
  },
  {
    title: translate('auto.components.settings.artifacts.showButton', 'Show Artifacts Button'),
    description: translate(
      'auto.components.settings.artifacts.showButtonDescription',
      'Show the Artifacts shortcut in the sidebar.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordArtifacts', 'artifacts'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordShare', 'share'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordHtml', 'HTML'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordMarkdown', 'Markdown')
    ]
  },
  {
    title: translate(
      'auto.components.selfHostedArtifacts.settings.statusLabel',
      'Share service on this computer'
    ),
    description: translate(
      'auto.components.selfHostedArtifacts.settings.serviceSearchDescription',
      'Check the share service and change the IP address or port that links use.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.selfHostedArtifacts.settings.keywordPort', 'port'),
      ...translateSearchKeyword('auto.components.selfHostedArtifacts.settings.keywordIp', 'IP', {
        englishOnly: true
      }),
      ...translateSearchKeyword(
        'auto.components.selfHostedArtifacts.settings.keywordLocalNetwork',
        'local network'
      )
    ]
  }
])
