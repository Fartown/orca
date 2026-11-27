import Constants from 'expo-constants'
import { ListRow } from '../components/list/ListGroup'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { SettingsNote, SettingsSection } from '../settings/settings-screen-frame'
import { useIntegrationUpdateAction } from './use-integration-update-action'

export function IntegrationSettingsUpdateSection() {
  const t = useMobileTranslation()
  const { stage, error, summary, label, pending, onPress } = useIntegrationUpdateAction()
  const version = Constants.expoConfig?.version
  return (
    <SettingsSection
      footer={
        error ? (
          <SettingsNote error>{error}</SettingsNote>
        ) : summary ? (
          <SettingsNote>{summary}</SettingsNote>
        ) : undefined
      }
    >
      {version ? (
        <ListRow
          key="version"
          title={t('settings.appUpdateSettingsRows.installedVersion', 'Version {{version}}', {
            version
          })}
        />
      ) : null}
      <ListRow
        key="check"
        title={label}
        value={
          stage === 'latest'
            ? t('settings.appUpdateSettingsRows.upToDate', 'Up to date')
            : undefined
        }
        busy={pending}
        onPress={onPress}
      />
    </SettingsSection>
  )
}
