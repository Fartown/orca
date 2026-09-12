import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { processSample } from './probe-startup-evidence.mjs'
import { verifyNativeRuntime } from './probe-runtime.mjs'

export function nativeStatePaths(output, profile) {
  return output.split('\n').flatMap((line) => {
    if (!line.startsWith('n')) {
      return []
    }
    const path = line.slice(1)
    return path.startsWith(`${profile}/`) ||
      /\/(?:Application Support|Caches|Logs)\/(?:orca|Orca|dev\.orca)[^/]*(?:\/|$)/.test(path) ||
      /\/(?:\.orca\/|[^/]*orca[^/]*\.sock$)/i.test(path)
      ? [path]
      : []
  })
}

export function nativeFailureEvidence({ native, appPath, profile, output }) {
  const sample = processSample(native.pid, output, 'native-b-main')
  const openFiles = spawnSync('/usr/sbin/lsof', ['-p', String(native.pid), '-Fn'], {
    encoding: 'utf8',
    timeout: 10_000
  })
  const plist = spawnSync(
    '/usr/bin/plutil',
    ['-extract', 'LSEnvironment', 'json', join(appPath, 'Contents', 'Info.plist')],
    { encoding: 'utf8', timeout: 5_000 }
  )
  const environment = plist.status === 0 ? JSON.parse(plist.stdout) : {}
  const launchEnvironment = Object.fromEntries(
    [
      'HOME',
      'CFFIXED_USER_HOME',
      'ORCA_E2E_HOME_DIR',
      'ORCA_E2E_USER_DATA_DIR',
      'ORCA_BACKGROUND_LAUNCH',
      'ORCA_E2E_HEADLESS'
    ]
      .filter((key) => typeof environment[key] === 'string')
      .map((key) => [key, environment[key]])
  )
  const logs = join(profile, 'logs')
  if (existsSync(logs)) {
    cpSync(logs, join(output, 'native-runtime-logs'), { recursive: true })
  }
  return {
    sample,
    statePaths: nativeStatePaths(openFiles.stdout ?? '', profile),
    lsofStatus: openFiles.status,
    lsofError: String(openFiles.error ?? ''),
    profileEntries: readdirSync(profile),
    bundledLaunchEnvironment: launchEnvironment,
    scope: 'Own B PID sample and state paths only; no process environment or runtime auth token.'
  }
}

export async function observeNativeRelaunch(
  context,
  verify = verifyNativeRuntime,
  diagnose = nativeFailureEvidence
) {
  const { native, oldPid, appPath, profile, output } = context
  const evidence = {
    ...native,
    oldPid,
    mockKeychainArgumentRetained: native.command.includes('--use-mock-keychain'),
    rendererAcceptance:
      'Instrumented reopen follows native relaunch; native LaunchServices process observed separately.'
  }
  const destination = join(output, 'native-relaunch.json')
  writeJson(destination, evidence)
  console.log(`[real-orca] Native replacement observed: ${JSON.stringify(evidence)}`)
  try {
    evidence.readiness = await verify(appPath, profile, native.pid)
    writeJson(destination, evidence)
    return evidence.readiness
  } catch (error) {
    evidence.readinessError = String(error)
    writeJson(destination, evidence)
    try {
      evidence.diagnostics = diagnose(context)
    } catch (diagnosticError) {
      evidence.diagnosticsError = String(diagnosticError)
    }
    writeJson(destination, evidence)
    console.error(`[real-orca] Native B readiness failure: ${JSON.stringify(evidence)}`)
    throw error
  }
}
