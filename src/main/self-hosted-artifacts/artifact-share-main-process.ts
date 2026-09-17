import { homedir, hostname } from 'node:os'
import { isArtifactSharingEnabled } from '../../shared/artifact-sharing-gate'
import type { GlobalSettings } from '../../shared/global-settings-types'
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

/** Starts sharing for this app: it follows the settings toggle and stops when the app quits. */
export function startArtifactShareForMainProcess(input: {
  settings: ArtifactShareSettingsSource
  userDataPath: string
  resourcesPath: string | undefined
  appPath: string | null
  callRuntimeEnvironment: ArtifactShareRuntimeEnvironmentCall
}): void {
  const home = resolveArtifactShareHome(process.env, homedir())
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
    readStatus: () => appServer.status()
  })
  server = appServer
  registerArtifactShareRuntime({
    owner,
    userDataPath: input.userDataPath,
    callRuntimeEnvironment: input.callRuntimeEnvironment,
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
  input.settings.onSettingsChanged((updates, settings) => {
    if ('artifactSharingEnabled' in updates) {
      void appServer.setEnabled(isArtifactSharingEnabled(settings))
    }
  })
}

export async function stopArtifactShareForMainProcess(): Promise<void> {
  registerArtifactShareRuntime(null)
  await server?.stop()
}
