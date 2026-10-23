import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { runProcess } from '@orca/process-host'
import {
  APPIMAGE_SETTLE_MS,
  createSupervisedAppImageUpdate,
  resolveAppImageBuildWatch,
  serveAppImageAttemptPath,
  type AppImageBuildWatch
} from '../runtime/serve-appimage-update'
import { execveThisProcess } from '../runtime/serve-supervisor-relocation'
import { resolveAppImageCacheKey } from '../../shared/appimage-cache-identity'
import { waitForMacBundleVersion } from '../runtime/mac-app-update-bundle'
import type { InstallRequestedHandoff } from '../runtime/serve-supervisor-policy'

export async function awaitServeUpdateHandoff(options: {
  executable: string
  handoffPath: string
  handoff: InstallRequestedHandoff
  signal: AbortSignal
  watch?: AppImageBuildWatch | null
  recordFailure: (path: string, handoff: InstallRequestedHandoff, reason: string) => Promise<void>
}): Promise<InstallRequestedHandoff | null> {
  const { executable, handoffPath, handoff, signal, watch } = options
  const linuxReady = await finishLinuxServeUpdate({
    executable,
    targetVersion: handoff.targetVersion,
    userDataPath: dirname(handoffPath),
    signal,
    watch
  })
  if (
    linuxReady ??
    (await waitForMacBundleVersion(executable, handoff.targetVersion, undefined, signal))
  ) {
    return handoff
  }
  if (!signal.aborted) {
    await options.recordFailure(
      handoffPath,
      handoff,
      `Timed out waiting for Orca ${handoff.targetVersion} to be installed.`
    )
  }
  return null
}

export function linuxServeUpdateEnvironment(
  executable: string,
  supervised: boolean,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
) {
  const watch = supervised ? resolveAppImageBuildWatch(executable, env, platform) : null
  return watch
    ? { APPIMAGE: watch.appImagePath, APPDIR: dirname(executable), APPIMAGE_EXTRACT_AND_RUN: '1' }
    : null
}

function installedVersion(executable: string): string | null {
  try {
    const value: unknown = JSON.parse(
      readFileSync(
        join(dirname(executable), 'resources/app.asar.unpacked/out/package.json'),
        'utf8'
      )
    )
    return value &&
      typeof value === 'object' &&
      'version' in value &&
      typeof value.version === 'string'
      ? value.version
      : null
  } catch {
    return null
  }
}

type LinuxServeUpdateOptions = {
  executable: string
  targetVersion: string
  userDataPath: string
  signal: AbortSignal
  watch?: AppImageBuildWatch | null
  env?: NodeJS.ProcessEnv
  argv?: string[]
  platform?: NodeJS.Platform
  run?: typeof runProcess
  execve?: typeof execveThisProcess
  log?: (line: string) => void
}

export async function finishLinuxServeUpdate(
  options: LinuxServeUpdateOptions
): Promise<boolean | null> {
  const platform = options.platform ?? process.platform
  if (platform !== 'linux') {
    return null
  }
  const env = options.env ?? process.env
  const watch =
    options.watch === undefined
      ? resolveAppImageBuildWatch(options.executable, env, platform)
      : options.watch
  if (!watch || options.signal.aborted) {
    return false
  }
  if (
    installedVersion(options.executable) === options.targetVersion &&
    watch.runningKey === resolveAppImageCacheKey(watch.appImagePath)
  ) {
    return true
  }
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  const update = createSupervisedAppImageUpdate({
    watch,
    attemptPath: serveAppImageAttemptPath(options.userDataPath),
    force: false,
    argv: options.argv ?? process.argv,
    env: { ...env, APPIMAGE_EXTRACT_AND_RUN: '1' },
    execve: options.execve ?? execveThisProcess,
    log,
    probe: async (appImagePath, probeEnv) => {
      try {
        const result = await (options.run ?? runProcess)({
          program: appImagePath,
          args: ['--version'],
          env: probeEnv,
          timeoutMs: 60_000,
          maxOutputBytes: 64 * 1024,
          signal: options.signal
        })
        return result.code === 0 && result.stdout.trim() === options.targetVersion
          ? null
          : `The replacement AppImage did not report Orca ${options.targetVersion}.`
      } catch {
        return `Could not verify the replacement AppImage for Orca ${options.targetVersion}.`
      }
    }
  })
  if (update.inspect() === 'settling') {
    await setTimeout(APPIMAGE_SETTLE_MS, undefined, { signal: options.signal }).catch(
      () => undefined
    )
  }
  if (options.signal.aborted || update.inspect() !== 'superseded') {
    return false
  }
  const reason = await update.restart(() => options.signal.aborted)
  log(`[serve] Update to Orca ${options.targetVersion} was not started: ${reason}`)
  return false
}
