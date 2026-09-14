import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import * as FileSystem from 'expo-file-system/legacy'
import {
  fetchIntegrationRelease,
  integrationDownloadUrl,
  type IntegrationRelease
} from '../../../src/shared/integration-builds/release-catalog'
import { downloadResumableApk } from './apk-download'
import { createUpdateController } from './update-controller'

interface NativeUpdate {
  getVersionCode(): number
  canInstall(): boolean
  verify(sha256: string, bytes: number, versionCode: number): Promise<void>
  requestPermission(): Promise<void>
  install(): Promise<void>
}

const APK_ASSET = 'orca-integration-android.apk'
// Drop a connection that has not moved for this long instead of burning the whole attempt budget
// on a proxy that accepted the socket and then went silent.
const STALL_TIMEOUT_MS = 45 * 1000
const ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000

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

function updateDirectory(): string {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Update cache is unavailable.')
  }
  return `${FileSystem.cacheDirectory}integration-update/`
}

// The native installer reads this exact path, so a resumed download has to reuse the same file.
const apkPath = () => `${updateDirectory()}update.apk`
const tagPath = () => `${updateDirectory()}update.tag`

async function discardUpdateCache(): Promise<void> {
  await FileSystem.deleteAsync(apkPath(), { idempotent: true }).catch(() => {})
  await FileSystem.deleteAsync(tagPath(), { idempotent: true }).catch(() => {})
}

function apkAsset(release: IntegrationRelease) {
  const asset = release.assets.find((item) => item.name === APK_ASSET)
  if (!asset) {
    throw new Error('Update manifest does not contain an APK.')
  }
  return asset
}

async function runAttempt(
  release: IntegrationRelease,
  offset: number,
  progress: (percent: number) => void
): Promise<number | null> {
  let cancel = () => {}
  let idle: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(idle)
    idle = setTimeout(() => cancel(), STALL_TIMEOUT_MS)
  }
  const task = FileSystem.createDownloadResumable(
    integrationDownloadUrl(release.tag, APK_ASSET),
    apkPath(),
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      arm()
      if (totalBytesExpectedToWrite > 0) {
        progress((totalBytesWritten / totalBytesExpectedToWrite) * 100)
      }
    },
    offset > 0 ? String(offset) : undefined
  )
  cancel = () => {
    void task.cancelAsync().catch(() => {})
  }
  const deadline = setTimeout(() => cancel(), ATTEMPT_TIMEOUT_MS)
  arm()
  try {
    const result = await task.downloadAsync()
    return result ? result.status : null
  } finally {
    clearTimeout(idle)
    clearTimeout(deadline)
  }
}

export const mobileUpdates = createUpdateController({
  versionCode: () => installer().getVersionCode(),
  latest: () => fetchIntegrationRelease('android'),
  download: async (release, progress) => {
    const asset = apkAsset(release)
    await FileSystem.makeDirectoryAsync(updateDirectory(), { intermediates: true })
    await downloadResumableApk(
      { tag: release.tag, expectedBytes: asset.bytes },
      {
        partialBytes: async () => {
          const info = await FileSystem.getInfoAsync(apkPath())
          return info.exists && !info.isDirectory ? info.size : 0
        },
        cachedTag: () => FileSystem.readAsStringAsync(tagPath()).catch(() => null),
        claim: (tag) => FileSystem.writeAsStringAsync(tagPath(), tag),
        discard: discardUpdateCache,
        attempt: (offset) => runAttempt(release, offset, progress),
        delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      }
    )
  },
  verify: async (release) => {
    const asset = apkAsset(release)
    try {
      await installer().verify(asset.sha256, asset.bytes, release.androidVersionCode)
    } catch (error) {
      // Bytes that fail their digest must never be resumed onto.
      await discardUpdateCache()
      throw error
    }
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
