import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeCodexToolCallerIdentity } from './codex-tool-caller-environment'
import {
  createDaemonPtyEnvironment,
  rescrubDaemonPtyEnvironment
} from '../daemon/pty-subprocess/spawn-environment'
import {
  buildLocalPtySpawnEnvironment,
  enforceLocalPtySpawnEnvironmentOverrides
} from '../providers/local-pty-spawn-environment'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('new pane Codex caller boundary', () => {
  it.each(['darwin', 'linux', 'win32'] as const)(
    'removes only the tool caller on %s',
    (platform) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
      const env = {
        CODEX_THREAD_ID: 'outer',
        codex_thread_id: 'lower',
        CODEX_HOME: '/provider',
        ORCA_PANE_KEY: 'new-pane'
      }
      removeCodexToolCallerIdentity(env)
      expect(env).not.toHaveProperty('CODEX_THREAD_ID')
      expect(env.codex_thread_id).toBe(platform === 'win32' ? undefined : 'lower')
      expect(env.CODEX_HOME).toBe('/provider')
      expect(env.ORCA_PANE_KEY).toBe('new-pane')
    }
  )

  it('removes a persistent daemon caller and any later environment reinjection', () => {
    vi.stubEnv('CODEX_THREAD_ID', 'outer-daemon-thread')
    const opts = {
      sessionId: 'new-pane',
      cols: 80,
      rows: 24,
      env: { CODEX_THREAD_ID: 'stale-overlay' }
    }
    const env = createDaemonPtyEnvironment(opts)
    expect(env.CODEX_THREAD_ID).toBeUndefined()
    env.CODEX_THREAD_ID = 'late-overlay'
    rescrubDaemonPtyEnvironment(env, opts)
    expect(env.CODEX_THREAD_ID).toBeUndefined()
    expect(process.env.CODEX_THREAD_ID).toBe('outer-daemon-thread')
  })

  it('removes the local provider host caller without changing the host process', async () => {
    vi.stubEnv('CODEX_THREAD_ID', 'outer-host-thread')
    const env = await buildLocalPtySpawnEnvironment({
      id: 'new-pane',
      spawn: { cols: 80, rows: 24 },
      getOptions: () => ({}),
      plan: { shellPath: '/bin/sh' } as Parameters<typeof buildLocalPtySpawnEnvironment>[0]['plan']
    })
    expect(env.CODEX_THREAD_ID).toBeUndefined()
    env.CODEX_THREAD_ID = 'augmenter-thread'
    enforceLocalPtySpawnEnvironmentOverrides({ cols: 80, rows: 24 }, env)
    expect(env.CODEX_THREAD_ID).toBeUndefined()
    expect(process.env.CODEX_THREAD_ID).toBe('outer-host-thread')
  })
})
