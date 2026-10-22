import { getAppEnvironment } from '../../shared/app-environment'
import { resolveOrcadInstallRoot } from '../orcad/orcad-app-paths'
import {
  startArtifactShareForMainProcess,
  stopArtifactShareForMainProcess,
  type ArtifactShareSettingsSource
} from './artifact-share-main-process'
import {
  ArtifactShareError,
  ARTIFACT_SHARE_ERROR_CODES
} from '../../shared/self-hosted-artifacts/artifact-share-errors'

/** The SSH runtime serves its own files and port; a desktop on the same host shares the lock. */
export function startOrcadArtifactShare(
  settings: ArtifactShareSettingsSource
): () => Promise<void> {
  startArtifactShareForMainProcess({
    settings,
    userDataPath: getAppEnvironment().getPath('userData'),
    resourcesPath: undefined,
    appPath: resolveOrcadInstallRoot(),
    isEnvironmentReachable: () => false,
    callRuntimeEnvironment: async () => {
      throw new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.unsupportedHost,
        'Select the file owner’s Orca Server connection before sharing.'
      )
    }
  })
  return stopArtifactShareForMainProcess
}
