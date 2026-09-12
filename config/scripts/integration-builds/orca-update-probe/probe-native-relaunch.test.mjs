import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readBundledLaunchEnvironment } from './probe-native-relaunch.mjs'
import { spawnSync } from 'node:child_process'
import { readExceptionMonitor, withExceptionMonitor } from './probe-exception-monitor.mjs'

describe('native relaunch read-only evidence', () => {
  it('records a real thrown Error without swallowing it or changing an existing handler', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-exception-monitor-contract-'))
    try {
      const destination = join(directory, 'monitor.jsonl')
      const source = "'use strict';\nthrow new Error('real-node-error-marker')"
      const observed = withExceptionMonitor(source, destination)
      expect(observed.startsWith("'use strict';")).toBe(true)
      const result = spawnSync(process.execPath, ['-e', observed], {
        encoding: 'utf8',
        timeout: 5_000
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('real-node-error-marker')
      expect(
        readExceptionMonitor(destination).find(({ event }) => event === 'uncaughtException').stack
      ).toContain('real-node-error-marker')
      const existingHandler =
        "'use strict'; process.on('uncaughtException', () => { process.exitCode = 42 }); throw new Error('handled-error')"
      expect(
        spawnSync(process.execPath, ['-e', withExceptionMonitor(existingHandler, destination)], {
          timeout: 5_000
        }).status
      ).toBe(42)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('preserves the original exception when diagnostic cwd or stack access throws', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-observer-access-contract-'))
    try {
      const destination = join(directory, 'monitor.jsonl')
      const handler =
        "process.on('uncaughtException', error => { process.stdout.write(error.message); process.exitCode = 42 });"
      const failedCwd = "process.cwd = () => { throw new Error('cwd-diagnostic-failure') };"
      const cwdResult = spawnSync(
        process.execPath,
        [
          '-e',
          failedCwd +
            withExceptionMonitor(handler + "throw new Error('original-cwd-error')", destination)
        ],
        { encoding: 'utf8', timeout: 5_000 }
      )
      expect(cwdResult.status).toBe(42)
      expect(cwdResult.stdout).toBe('original-cwd-error')
      const failedStack = `${handler}const error = new Error('original-stack-error'); Object.defineProperty(error, 'stack', { get() { throw new Error('stack-diagnostic-failure') } }); throw error;`
      const stackResult = spawnSync(
        process.execPath,
        ['-e', withExceptionMonitor(failedStack, destination)],
        { encoding: 'utf8', timeout: 5_000 }
      )
      expect(stackResult.status).toBe(42)
      expect(stackResult.stdout).toBe('original-stack-error')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it.runIf(process.platform === 'darwin')(
    'reads real plutil JSON without changing the signed plist',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'orca-plist-evidence-'))
      try {
        mkdirSync(join(directory, 'Contents'))
        const path = join(directory, 'Contents', 'Info.plist')
        writeFileSync(
          path,
          '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>fixture.app</string><key>LSEnvironment</key><dict><key>ORCA_E2E_USER_DATA_DIR</key><string>/isolated/profile</string><key>UNRELATED_SECRET</key><string>not-evidence</string></dict></dict></plist>'
        )
        const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex')
        const before = hash()
        expect(readBundledLaunchEnvironment(directory)).toEqual({
          ORCA_E2E_USER_DATA_DIR: '/isolated/profile'
        })
        expect(hash()).toBe(before)
        writeFileSync(path, 'not a plist')
        expect(readBundledLaunchEnvironment(directory)).toHaveProperty('error')
        expect(readFileSync(path, 'utf8')).toBe('not a plist')
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  )
})
