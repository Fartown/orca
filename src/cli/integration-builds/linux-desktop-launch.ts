import { resolveAppImageCacheKey } from '../../shared/appimage-cache-identity'
import {
  appImageLaunchEnvironment,
  resolveAppImageBuildWatch
} from '../runtime/serve-appimage-update'
import { RuntimeClientError } from '../runtime/types'

export function linuxDesktopAppImageLaunch(
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): { executable: string; env: NodeJS.ProcessEnv } | null {
  const watch = resolveAppImageBuildWatch(executable, env, platform)
  if (!watch) {
    return null
  }
  if (!resolveAppImageCacheKey(watch.appImagePath)) {
    throw new RuntimeClientError(
      'runtime_open_failed',
      'The original Orca AppImage is missing. Restore it or open the AppImage from its new location.'
    )
  }
  return {
    executable: watch.appImagePath,
    env: {
      ...appImageLaunchEnvironment(env),
      APPIMAGE_EXTRACT_AND_RUN: env.APPIMAGE_EXTRACT_AND_RUN ?? '1'
    }
  }
}
