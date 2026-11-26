import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { integrationUpdatesEnabled } from './mobile-updates'
import { useIntegrationUpdateAction } from './use-integration-update-action'

export function IntegrationUpdateRow() {
  const { stage, error, summary, label, pending, onPress } = useIntegrationUpdateAction()
  const t = useMobileTranslation()
  if (!integrationUpdatesEnabled) {
    return null
  }

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        style={styles.button}
        onPress={onPress}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {summary && <Text style={styles.detail}>{summary}</Text>}
      <Text style={styles.detail}>
        {t(
          'integrationBuilds.updateRow.channelNote',
          'Fork integration updates · Android installation requires confirmation.'
        )}
      </Text>
      {stage === 'latest' && (
        <Text style={styles.detail}>
          {t('integrationBuilds.updateRow.latest', 'You have the latest integration build.')}
        </Text>
      )}
      {stage === 'permission' && (
        <Text style={styles.detail}>
          {t(
            'integrationBuilds.updateRow.permission',
            'Allow updates from Orca in Android Settings, then return here and tap Install.'
          )}
        </Text>
      )}
      {stage === 'installer-opened' && (
        <Text style={styles.detail}>
          {t(
            'integrationBuilds.updateRow.installerOpened',
            'Installer opened. Confirm installation in Android; cancelling keeps the current app.'
          )}
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  button: { backgroundColor: colors.bgRaised, borderRadius: radii.control, padding: spacing.md },
  label: { color: colors.textPrimary, fontSize: typography.bodySize, textAlign: 'center' },
  detail: { color: colors.textSecondary, fontSize: typography.metaSize },
  error: { color: colors.statusRed, fontSize: typography.metaSize }
})
