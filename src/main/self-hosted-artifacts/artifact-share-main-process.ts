import { homedir, hostname } from 'node:os'
import { isArtifactSharingEnabled } from '../../shared/artifact-sharing-gate'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  removeArtifactShareReviewNotes,
  startArtifactShareCommentImport,
  type ArtifactShareCommentImportRuntime
} from './artifact-share-comment-import'
import { createArtifactShareOwnerService } from './artifact-share-owner-service'
import {
  registerArtifactShareRuntime,
  type ArtifactShareRuntimeEnvironmentCall
} from './artifact-share-runtime-registry'
import { ArtifactShareAppServer } from './server/artifact-share-app-server'
import { resolveArtifactShareViewerAssets } from './server/artifact-share-viewer-assets'
import { readArtifactShareConfig, updateArtifactShareConfig } from './store/artifact-share-config'
import { resolveArtifactShareHome } from './store/artifact-share-store-layout'

export type ArtifactShareSettingsSource = {
  getSettings: () => Pick<GlobalSettings, 'artifactSharingEnabled'>
  onSettingsChanged: (
    listener: (updates: Partial<GlobalSettings>, settings: GlobalSettings) => void
  ) => unknown
}

let server: ArtifactShareAppServer | null = null
let removeSettingsListener: (() => void) | null = null
let stopCommentImport: (() => void) | null = null

/** Starts sharing for this app: it follows the settings toggle and stops when the app quits. */
export function startArtifactShareForMainProcess(input: {
  settings: ArtifactShareSettingsSource
  userDataPath: string
  resourcesPath: string | undefined
  appPath: string | null
  callRuntimeEnvironment: ArtifactShareRuntimeEnvironmentCall
  isEnvironmentReachable: (environmentId: string) => boolean
  /** The runtime owning this computer's workspaces; reader comments become its review notes. */
  commentRuntime?: ArtifactShareCommentImportRuntime
}): void {
  const home = resolveArtifactShareHome(process.env, homedir())
  const commentRuntime = input.commentRuntime
  const computerLabel = hostname()
  const appServer = new ArtifactShareAppServer({
    home,
    computerLabel,
    viewer: resolveArtifactShareViewerAssets({
      env: process.env,
      resourcesPath: input.resourcesPath,
      appPath: input.appPath
    })
  })
  const owner = createArtifactShareOwnerService({
    home,
    host: { executionHostId: 'local', label: computerLabel },
    readStatus: () => appServer.status(),
    removeReviewNotes: commentRuntime
      ? (absolutePath, commentIds) =>
          removeArtifactShareReviewNotes(commentRuntime, absolutePath, commentIds)
      : undefined
  })
  server = appServer
  registerArtifactShareRuntime({
    owner,
    userDataPath: input.userDataPath,
    callRuntimeEnvironment: input.callRuntimeEnvironment,
    isEnvironmentReachable: input.isEnvironmentReachable,
    configureLocal: async (request) => {
      const before = readArtifactShareConfig(home)
      await updateArtifactShareConfig(home, {
        ...(request.port !== undefined ? { confirmedPort: request.port } : {}),
        ...(request.ip !== undefined ? { ip: request.ip } : {})
      })
      if (request.port !== undefined && request.port !== before.confirmedPort) {
        await appServer.restart()
      } else if (request.ip !== undefined) {
        await appServer.refreshAddress()
      }
    }
  })
  void appServer.setEnabled(isArtifactSharingEnabled(input.settings.getSettings()))
  const unsubscribe = input.settings.onSettingsChanged((updates, settings) => {
    if ('artifactSharingEnabled' in updates) {
      void appServer.setEnabled(isArtifactSharingEnabled(settings))
    }
  })
  removeSettingsListener = typeof unsubscribe === 'function' ? () => unsubscribe() : null
  stopCommentImport = commentRuntime
    ? startArtifactShareCommentImport({
        home,
        userDataPath: input.userDataPath,
        runtime: commentRuntime,
        onError: (error) => console.warn('[artifact-share] comment import failed', error)
      })
    : null
}

export async function stopArtifactShareForMainProcess(): Promise<void> {
  const unsubscribe = removeSettingsListener
  removeSettingsListener = null
  unsubscribe?.()
  stopCommentImport?.()
  stopCommentImport = null
  registerArtifactShareRuntime(null)
  await server?.stop()
}
