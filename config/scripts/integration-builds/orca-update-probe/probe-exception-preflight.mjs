import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { processSample } from './probe-startup-evidence.mjs'
import { withExceptionMonitor, readExceptionMonitor } from './probe-exception-monitor.mjs'
import { waitUntil } from './probe-runtime.mjs'

export async function verifyExceptionObserver(scratch, output, isolation) {
  assertHostedMac()
  console.log(
    '[real-orca] Validate P2-only exception observer on a prohibited native-alert fixture'
  )
  const directory = join(scratch, 'exception-observer-fixture')
  mkdirSync(directory)
  const marker = `ORCA_NATIVE_ERROR_${randomBytes(12).toString('hex')}`
  const destination = join(output, 'exception-observer-fixture.jsonl')
  const entry = join(directory, 'main.cjs')
  const source = `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(directory)}); app.setActivationPolicy('prohibited'); app.whenReady().then(() => setTimeout(() => { throw new Error(${JSON.stringify(marker)}); }, 100));`
  writeFileSync(entry, withExceptionMonitor(source, destination))
  const env = {
    ...isolation.env,
    CFFIXED_USER_HOME: isolation.isolatedHome,
    ORCA_BACKGROUND_LAUNCH: '1'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(createRequire(import.meta.url)('electron'), [entry], {
    env,
    cwd: directory,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let spawnError
  child.on('error', (error) => {
    spawnError = error
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) =>
      appendFileSync(join(output, 'exception-observer-fixture.log'), chunk)
    )
  }
  try {
    await waitUntil(
      () => {
        if (spawnError) {
          throw spawnError
        }
        return readExceptionMonitor(destination).some(
          ({ event, stack }) => event === 'uncaughtException' && stack.includes(marker)
        )
      },
      'Fixture observer records the real thrown Error',
      15_000
    )
    const sample = processSample(child.pid, output, 'exception-observer-fixture')
    const modalPreserved = readFileSync(
      join(output, `exception-observer-fixture-${child.pid}.sample.txt`),
      'utf8'
    ).includes('NSAlert runModal')
    writeJson(join(output, 'exception-observer-preflight.json'), {
      marker,
      pid: child.pid,
      activationPolicy: 'prohibited',
      sample,
      errorRecorded: true,
      modalPreserved
    })
    if (!modalPreserved) {
      throw new Error('P2 observer fixture did not retain default NSAlert behavior')
    }
    console.log(
      '[real-orca] P2 observer recorded the real Error; prohibited NSAlert behavior preserved'
    )
  } finally {
    try {
      child.kill('SIGTERM')
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
    child.stdout.destroy()
    child.stderr.destroy()
  }
}
