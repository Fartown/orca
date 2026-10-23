import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync
} from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SERVE_UPDATE_HANDOFF_PATH_ENV,
  getServeUpdateHandoffPath
} from '../../shared/serve-update-handoff'

const mocks = vi.hoisted(() => ({
  app: { getVersion: () => '1.0.0', quit: vi.fn() },
  userDataPath: vi.fn()
}))
vi.mock('electron', () => ({ app: mocks.app }))
vi.mock('../persistence', () => ({ getCanonicalUserDataPath: mocks.userDataPath }))
vi.mock('./linux-serve-update-support', () => ({ hasLinuxServeUpdateSupervisor: () => true }))
import {
  hasServeUpdateSupervisor,
  installServeSupervisorDisconnectQuit,
  requestServeUpdateHandoff
} from '../serve-update-handoff'

describe('serve update handoff profile identity', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  let root: string
  let profile: string
  let alias: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-handoff-path-')))
    profile = join(root, 'profile')
    alias = join(root, 'profile-alias')
    mkdirSync(profile)
    symlinkSync(profile, alias, process.platform === 'win32' ? 'junction' : 'dir')
    mocks.userDataPath.mockReturnValue(profile)
    mocks.app.quit.mockClear()
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  })

  it.each(['linux', 'darwin'] as const)(
    'accepts an unwritten handoff through a profile alias on %s',
    (target) => {
      Object.defineProperty(process, 'platform', { configurable: true, value: target })
      vi.stubEnv(SERVE_UPDATE_HANDOFF_PATH_ENV, getServeUpdateHandoffPath(alias))
      expect(existsSync(getServeUpdateHandoffPath(profile))).toBe(false)
      expect(hasServeUpdateSupervisor()).toBe(true)
      expect(requestServeUpdateHandoff('1.1.0')).toBe(true)
      expect(JSON.parse(readFileSync(getServeUpdateHandoffPath(profile), 'utf8'))).toMatchObject({
        phase: 'install-requested',
        targetVersion: '1.1.0',
        servingPid: process.pid
      })
      const parent = new EventEmitter()
      const dispose = installServeSupervisorDisconnectQuit(true, parent)
      parent.emit('disconnect')
      expect(mocks.app.quit).toHaveBeenCalledOnce()
      dispose()
    }
  )

  it.each(['canonical', 'other-profile', 'wrong-name', 'missing'] as const)(
    'keeps the handoff boundary for %s',
    (kind) => {
      Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
      const other = join(root, 'other-profile')
      mkdirSync(other)
      const configured = {
        canonical: getServeUpdateHandoffPath(profile),
        'other-profile': getServeUpdateHandoffPath(other),
        'wrong-name': join(alias, 'other.json'),
        missing: undefined
      }[kind]
      vi.stubEnv(SERVE_UPDATE_HANDOFF_PATH_ENV, configured)
      expect(hasServeUpdateSupervisor()).toBe(kind === 'canonical')
      expect(requestServeUpdateHandoff('1.1.0')).toBe(kind === 'canonical')
    }
  )
})
