import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { processSample } from './probe-startup-evidence.mjs'
import { verifyNativeRuntime } from './probe-runtime.mjs'
import { captureNativeAlert } from './probe-native-alert.mjs'

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
  const paths = {
    statePaths: nativeStatePaths(openFiles.stdout ?? '', profile),
    lsofStatus: openFiles.status,
    lsofError: String(openFiles.error ?? '')
  }
  writeJson(join(output, `native-open-files-${native.pid}.json`), paths)
  const logs = join(profile, 'logs')
  if (existsSync(logs)) {
    cpSync(logs, join(output, 'native-runtime-logs'), { recursive: true })
  }
  const chromiumLog = join(profile, 'native-electron.log')
  if (existsSync(chromiumLog)) {
    cpSync(chromiumLog, join(output, 'native-electron.log'))
  }
  const evidence = {
    sample,
    ...paths,
    profileEntries: readdirSync(profile),
    bundledLaunchEnvironment: readBundledLaunchEnvironment(appPath),
    scope: 'Own B PID sample and state paths only; no process environment or runtime auth token.'
  }
  writeJson(join(output, `native-process-${native.pid}.json`), evidence)
  try {
    evidence.alert = captureNativeAlert(native.pid, output)
  } catch (error) {
    evidence.alertError = String(error)
  }
  return evidence
}

export function readBundledLaunchEnvironment(appPath) {
  const plist = spawnSync(
    '/usr/bin/plutil',
    ['-extract', 'LSEnvironment', 'json', '-o', '-', join(appPath, 'Contents', 'Info.plist')],
    { encoding: 'utf8', timeout: 5_000 }
  )
  let environment
  try {
    if (plist.status !== 0) {
      throw plist.error ?? new Error(plist.stderr || 'plutil failed')
    }
    environment = JSON.parse(plist.stdout)
  } catch (error) {
    return { error: String(error), status: plist.status }
  }
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
  return launchEnvironment
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
