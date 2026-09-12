import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readBundledLaunchEnvironment } from './probe-native-relaunch.mjs'
import {
  captureNativeAlert,
  nativeAlertTextScript,
  nativeWindowInventoryScript
} from './probe-native-alert.mjs'

describe('native relaunch read-only evidence', () => {
  it('isolates an unavailable native alert channel and keeps each prior result', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-native-alert-contract-'))
    try {
      mkdirSync(join(directory, 'screenshots'))
      const calls = []
      const evidence = captureNativeAlert(
        123,
        directory,
        (command, args, options) => {
          calls.push({ command, args, options })
          return args.includes(nativeWindowInventoryScript)
            ? { status: 0, stdout: '[{"id":456,"title":"Fixture error"}]' }
            : { status: null, error: new Error('fixture permission timeout') }
        },
        () => {}
      )
      expect(evidence.windows).toEqual([{ id: 456, title: 'Fixture error' }])
      expect(evidence.screenshots[0].exists).toBe(false)
      expect(evidence.textError).toContain('fixture permission timeout')
      expect(calls.every(({ options }) => options.timeout <= 8_000)).toBe(true)
      expect(calls[1].args.slice(0, 3)).toEqual(['-x', '-l', '456'])
      expect(nativeAlertTextScript).not.toMatch(/activate|click|keystroke|key code/)
      expect(nativeWindowInventoryScript).toContain('window.kCGWindowOwnerPID === Number(argv[0])')
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
