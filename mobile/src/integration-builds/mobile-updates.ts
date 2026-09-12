import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import * as FileSystem from 'expo-file-system/legacy'
import {
  fetchIntegrationRelease,
  integrationDownloadUrl
} from '../../../src/shared/integration-builds/release-catalog'
import { createUpdateController } from './update-controller'

interface NativeUpdate {
  getVersionCode(): number
  canInstall(): boolean
  verify(sha256: string, bytes: number, versionCode: number): Promise<void>
  requestPermission(): Promise<void>
  install(): Promise<void>
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeUpdate>('OrcaAppUpdate') : null
export const integrationUpdatesEnabled =
  Platform.OS === 'android' && Constants.expoConfig?.extra?.orcaUpdateChannel === 'integration'

function installer(): NativeUpdate {
  if (!native) {
    throw new Error('Install a new integration APK to enable in-app updates.')
  }
  return native
}

export const mobileUpdates = createUpdateController({
  versionCode: () => installer().getVersionCode(),
  latest: () => fetchIntegrationRelease('android'),
  download: async (release, progress) => {
    if (!FileSystem.cacheDirectory) {
      throw new Error('Update cache is unavailable.')
    }
    const directory = `${FileSystem.cacheDirectory}integration-update/`
    const destination = `${directory}update.apk`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    await FileSystem.deleteAsync(destination, { idempotent: true })
    const task = FileSystem.createDownloadResumable(
      integrationDownloadUrl(release.tag, 'orca-integration-android.apk'),
      destination,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
          progress((totalBytesWritten / totalBytesExpectedToWrite) * 100)
        }
      }
    )
    let timedOut = false
    const timeout = setTimeout(
      () => {
        timedOut = true
        void task.cancelAsync().catch(() => {})
      },
      10 * 60 * 1000
    )
    try {
      const result = await task.downloadAsync()
      if (timedOut) {
        throw new Error('APK download timed out. Try again.')
      }
      if (!result || result.status !== 200) {
        throw new Error(`APK download failed (HTTP ${result?.status ?? 'unknown'}).`)
      }
    } catch (error) {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {})
      throw error
    } finally {
      clearTimeout(timeout)
    }
  },
  verify: async (release) => {
    const apk = release.assets.find((asset) => asset.name === 'orca-integration-android.apk')
    if (!apk) {
      throw new Error('Update manifest does not contain an APK.')
    }
    await installer().verify(apk.sha256, apk.bytes, release.androidVersionCode)
  },
  canInstall: () => installer().canInstall(),
  requestPermission: () => installer().requestPermission(),
  install: () => installer().install()
})

export async function downloadAndInstallUpdate(): Promise<void> {
  await mobileUpdates.download()
  if (mobileUpdates.store.getState().stage === 'ready') {
    await mobileUpdates.install()
  }
}
