import { useEffect } from 'react'
import { Alert, AppState, Pressable, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useStore } from 'zustand'
import { colors, spacing, typography } from '../theme/mobile-theme'
import {
  downloadAndInstallUpdate,
  integrationUpdatesEnabled,
  mobileUpdates
} from './mobile-updates'

let announcedTag: string | null = null

export function IntegrationUpdateGate() {
  const router = useRouter()
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
        'Orca update available',
        `Integration ${release.sha.slice(0, 12)} is available. Download the APK now? Android will ask you to confirm installation. You can also update later in Settings → About.`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Download',
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
      ? `Downloading Orca update… ${Math.floor(progress)}%`
      : stage === 'verifying'
        ? 'Verifying Orca update…'
        : stage === 'error'
          ? 'Orca update failed — tap to retry'
          : 'Orca update ready — tap to continue installation'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/about')}
      style={{ padding: spacing.md, backgroundColor: colors.bgRaised }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typography.metaSize }}>{label}</Text>
    </Pressable>
  )
}
