import { useEffect } from 'react'
import { Alert, AppState, Pressable, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from 'zustand'
import { translate } from '../i18n/mobile-i18n'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, spacing, typography } from '../theme/mobile-theme'
import {
  downloadAndInstallUpdate,
  integrationUpdatesEnabled,
  mobileUpdates
} from './mobile-updates'

let announcedTag: string | null = null

export function IntegrationUpdateGate() {
  const router = useRouter()
  const t = useMobileTranslation()
  // Why: this banner mounts above the navigator in the root layout, so nothing else pads it
  // away from the status bar and the notch — the label rendered under both.
  const insets = useSafeAreaInsets()
  const { stage, progress, release } = useStore(mobileUpdates.store)
  useEffect(() => {
    if (!integrationUpdatesEnabled) {
      return
    }
    function announce() {
      const { stage, release } = mobileUpdates.store.getState()
      if (
        AppState.currentState !== 'active' ||
        stage !== 'available' ||
        !release ||
        announcedTag === release.tag
      ) {
        return
      }
      announcedTag = release.tag
      Alert.alert(
        translate('integrationBuilds.updateGate.availableTitle', 'Orca update available'),
        translate(
          'integrationBuilds.updateGate.availableMessage',
          'Integration {{sha}} is available. Download the APK now? Android will ask you to confirm installation. You can also update later in Settings → About.',
          { sha: release.sha.slice(0, 12) }
        ),
        [
          { text: translate('integrationBuilds.updateGate.later', 'Later'), style: 'cancel' },
          {
            text: translate('integrationBuilds.updateGate.download', 'Download'),
            onPress: () => {
              void downloadAndInstallUpdate()
            }
          }
        ]
      )
    }
    const unsubscribe = mobileUpdates.store.subscribe(announce)
    void mobileUpdates.check()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return
      }
      mobileUpdates.resume()
      announce()
      void mobileUpdates.check()
    })
    return () => {
      unsubscribe()
      subscription.remove()
    }
  }, [])
  if (
    !integrationUpdatesEnabled ||
    !release ||
    !['downloading', 'verifying', 'error', 'permission', 'ready'].includes(stage)
  ) {
    return null
  }
  const label =
    stage === 'downloading'
      ? t('integrationBuilds.updateGate.downloading', 'Downloading Orca update… {{percent}}%', {
          percent: Math.floor(progress)
        })
      : stage === 'verifying'
        ? t('integrationBuilds.updateGate.verifying', 'Verifying Orca update…')
        : stage === 'error'
          ? t('integrationBuilds.updateGate.failed', 'Orca update failed — tap to retry')
          : t(
              'integrationBuilds.updateGate.ready',
              'Orca update ready — tap to continue installation'
            )
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/about')}
      style={{
        padding: spacing.md,
        paddingTop: insets.top + spacing.md,
        backgroundColor: colors.bgRaised
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typography.metaSize }}>{label}</Text>
    </Pressable>
  )
}
