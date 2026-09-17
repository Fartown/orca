import { join } from 'node:path'

export const ARTIFACT_SHARE_HOME_ENV = 'ORCA_ARTIFACT_SHARE_HOME'

/** One directory per OS user, shared by the desktop app and the relay running on the same computer. */
export function resolveArtifactShareHome(env: NodeJS.ProcessEnv, homeDir: string): string {
  const configured = env[ARTIFACT_SHARE_HOME_ENV]?.trim()
  return configured ? configured : join(homeDir, '.orca-artifact-share')
}

export function artifactShareRecordsPath(home: string): string {
  return join(home, 'shares.json')
}

export function artifactShareConfigPath(home: string): string {
  return join(home, 'config.json')
}

export function artifactShareServingStatePath(home: string): string {
  return join(home, 'serving.json')
}

export function artifactShareServingLockTarget(home: string): string {
  return join(home, 'serving')
}

export function artifactShareLogPath(home: string): string {
  return join(home, 'logs', 'serve.log')
}
