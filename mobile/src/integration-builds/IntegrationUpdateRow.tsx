import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useStore } from 'zustand'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  downloadAndInstallUpdate,
  integrationUpdatesEnabled,
  mobileUpdates
} from './mobile-updates'

export function IntegrationUpdateRow() {
  const { stage, progress, error, release } = useStore(mobileUpdates.store)
  const t = useMobileTranslation()
  if (!integrationUpdatesEnabled) {
    return null
  }
  const pending = ['checking', 'downloading', 'verifying', 'installing'].includes(stage)
  const installable = ['ready', 'permission', 'installer-opened'].includes(stage)
  const label =
    stage === 'checking'
      ? t('integrationBuilds.updateRow.checking', 'Checking for updates…')
      : stage === 'downloading'
        ? t('integrationBuilds.updateRow.downloading', 'Downloading update… {{percent}}%', {
            percent: Math.floor(progress)
          })
        : stage === 'verifying'
          ? t('integrationBuilds.updateRow.verifying', 'Verifying APK…')
          : stage === 'installing'
            ? t('integrationBuilds.updateRow.installing', 'Opening Android installer…')
            : installable
              ? t('integrationBuilds.updateRow.install', 'Install downloaded update')
              : stage === 'available'
                ? t('integrationBuilds.updateRow.download', 'Download and install update')
                : stage === 'error' && release
                  ? t('integrationBuilds.updateRow.retry', 'Retry update')
                  : t('integrationBuilds.updateRow.check', 'Check for updates')
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        style={styles.button}
        onPress={() => {
          if (installable) {
            void mobileUpdates.install()
          } else if (stage === 'available' || (stage === 'error' && release)) {
            void downloadAndInstallUpdate()
          } else {
            void mobileUpdates.check(true)
          }
        }}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
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
