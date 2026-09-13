import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readBundledLaunchEnvironment } from './probe-native-relaunch.mjs'
import { spawnSync } from 'node:child_process'
import { readExceptionMonitor, withExceptionMonitor } from './probe-exception-monitor.mjs'
import { launchIsolationFixtureSource } from './probe-launch-preflight.mjs'

describe('native relaunch read-only evidence', () => {
  it('restores only the baked test home before imports and refuses mismatched fixture bindings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-native-home-contract-'))
    try {
      const home = join(directory, 'canonical-home')
      mkdirSync(home)
      const destination = join(directory, 'monitor.jsonl')
      const profile = join(directory, 'profile-alias')
      const stubElectron =
        "const realRequire = require; require = name => name === 'electron' ? { app: { commandLine: { appendSwitch: value => { if (value !== 'use-mock-keychain') throw new Error('wrong switch'); } } } } : realRequire(name);"
      const source = withExceptionMonitor(
        "'use strict'; process.stdout.write(require('node:os').homedir());",
        destination,
        { home, profile }
      )
      const env = {
        ...process.env,
        HOME: join(directory, 'launchservices-home'),
        ORCA_E2E_HOME_DIR: home,
        ORCA_E2E_USER_DATA_DIR: profile
      }
      const restored = spawnSync(process.execPath, ['-e', stubElectron + source], {
        env,
        encoding: 'utf8',
        timeout: 5000
      })
      expect(restored.status).toBe(0)
      expect(restored.stdout).toBe(home)
      expect(
        readExceptionMonitor(destination).find(({ event }) => event === 'P2-home-restored')
      ).toMatchObject({ before: env.HOME, after: home, nodeHome: home })
      const refused = spawnSync(process.execPath, ['-e', stubElectron + source], {
        env: { ...env, ORCA_E2E_HOME_DIR: directory },
        encoding: 'utf8',
        timeout: 5000
      })
      expect(refused.status).toBe(1)
      expect(refused.stderr).toContain('does not match this signed fixture')
      expect(refused.stdout).toBe('')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('bundles the actual production home guard into the small LaunchServices preflight', () => {
    const source = launchIsolationFixtureSource('/fixture/home', '/fixture/result.json')
    expect(source).toContain('Refusing to start E2E outside its disposable home boundary')
    expect(source).toContain('configureDevUserDataPath(false)')
    expect(source).toContain('wrong-fixture-home')
    expect(source).toContain('wrongHomeRejected')
    expect(source).not.toContain('node_modules')
    expect(source.length).toBeLessThan(12_000)
  })
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
