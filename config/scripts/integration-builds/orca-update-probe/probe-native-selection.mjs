import { join } from 'node:path'
import { command, writeJson } from '../signing-probe/probe-command.mjs'
import { matchingAppProcesses, readNativeRuntime, waitUntil } from './probe-runtime.mjs'
import { nativeFailureEvidence } from './probe-native-relaunch.mjs'
import { readExceptionMonitor } from './probe-exception-monitor.mjs'

export function selectNativeProcess(inventory, previousPids, metadata) {
  return (
    inventory.find(
      (candidate) => !previousPids.includes(candidate.pid) && candidate.pid === metadata.pid
    ) ?? null
  )
}

export async function waitForNativeReplacement({
  appPath,
  version,
  beforeProcesses,
  profile,
  output
}) {
  const previousPids = beforeProcesses.map(({ pid }) => pid)
  let observation
  let serialized
  try {
    const result = await waitUntil(
      () => {
        const diskVersion = command(
          '/usr/bin/plutil',
          [
            '-extract',
            'CFBundleShortVersionString',
            'raw',
            join(appPath, 'Contents', 'Info.plist')
          ],
          { allowFailure: true, timeout: 5_000 }
        ).stdout.trim()
        const inventory = matchingAppProcesses(appPath)
        const metadata = readNativeRuntime(profile)
        const exception = readExceptionMonitor(
          join(profile, 'native-exception-monitor.jsonl')
        ).find(
          ({ event, pid }) =>
            event === 'uncaughtException' &&
            !previousPids.includes(pid) &&
            inventory.some((candidate) => candidate.pid === pid)
        )
        observation = { diskVersion, inventory, metadata, previousPids, exception }
        const current = JSON.stringify(observation)
        if (current !== serialized) {
          writeJson(join(output, 'native-relaunch-observation.json'), observation)
          console.log(`[real-orca] Native selection: ${current}`)
          serialized = current
        }
        const candidate = selectNativeProcess(inventory, previousPids, metadata)
        if (exception) {
          return { exception }
        }
        return diskVersion === version && candidate ? { diskVersion, ...candidate } : null
      },
      'Native replacement and new runtime-owned B process',
      180_000
    )
    if (result.exception) {
      throw new Error(`Native B uncaught exception: ${result.exception.stack}`)
    }
    return result
  } catch (error) {
    const candidates = (observation?.inventory ?? []).filter(
      ({ pid }) => !previousPids.includes(pid)
    )
    const diagnostics = candidates.map((native) => {
      try {
        return {
          pid: native.pid,
          evidence: nativeFailureEvidence({ native, appPath, profile, output })
        }
      } catch (diagnosticError) {
        return { pid: native.pid, error: String(diagnosticError) }
      }
    })
    writeJson(join(output, 'native-selection-failure.json'), { observation, diagnostics })
    throw error
  }
}
