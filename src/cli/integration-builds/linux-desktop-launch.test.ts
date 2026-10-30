import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appImageNamespaceKey, resolveAppImageCacheKey } from '../../shared/appimage-cache-identity'
import { ELECTRON_NO_SANDBOX_REQUEST_ENV } from '../../shared/electron-no-sandbox-request'

const spawn = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], _options: { env?: NodeJS.ProcessEnv }) => ({
    once: vi.fn(),
    unref: vi.fn()
  }))
)
vi.mock('node:child_process', () => ({ spawn }))

import { launchOrcaApp } from '../runtime/launch'
import { linuxDesktopAppImageLaunch } from './linux-desktop-launch'

const roots: string[] = []
const execPath = Object.getOwnPropertyDescriptor(process, 'execPath')
const platform = Object.getOwnPropertyDescriptor(process, 'platform')

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  if (execPath) {
    Object.defineProperty(process, 'execPath', execPath)
  }
  if (platform) {
    Object.defineProperty(process, 'platform', platform)
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orca-desktop-update-'))
  roots.push(root)
  const image = join(root, 'Orca.AppImage')
  await writeFile(image, 'first package')
  const key = resolveAppImageCacheKey(image)
  if (!key) {
    throw new Error('Missing package identity')
  }
  const namespace = join(root, 'cache', appImageNamespaceKey(image))
  const executable = join(namespace, key, 'orca-ide')
  await mkdir(dirname(executable), { recursive: true })
  await writeFile(executable, '')
  await writeFile(join(namespace, 'source-appimage'), image)
  return { root, image, executable }
}

describe('Linux desktop AppImage source launch', () => {
  it('launches the source AppImage through the actual orca open launch function', async () => {
    const f = await fixture()
    Object.defineProperty(process, 'execPath', { value: f.executable })
    Object.defineProperty(process, 'platform', { value: 'linux' })
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
    vi.stubEnv('ORCA_OPEN_COMMAND', '')
    vi.stubEnv('ORCA_APP_EXECUTABLE', '')
    vi.stubEnv('ORCA_USER_DATA_PATH', join(f.root, 'isolated-profile'))
    vi.stubEnv('APPDIR', '/stale-cache')
    vi.stubEnv('APPIMAGE', '/stale-image')
    vi.stubEnv('ORCA_BACKGROUND_LAUNCH', '1')
    vi.stubEnv(ELECTRON_NO_SANDBOX_REQUEST_ENV, '1')

    launchOrcaApp()

    expect(spawn).toHaveBeenCalledWith(
      f.image,
      expect.arrayContaining([`--user-data-dir=${join(f.root, 'isolated-profile')}`]),
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({ APPIMAGE_EXTRACT_AND_RUN: '1', ORCA_BACKGROUND_LAUNCH: '1' })
      })
    )
    const env = spawn.mock.calls[0]?.[2]?.env
    expect(env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(env).not.toHaveProperty('APPIMAGE')
    expect(env).not.toHaveProperty('APPDIR')
    expect(env).not.toHaveProperty(ELECTRON_NO_SANDBOX_REQUEST_ENV)
  })

  it('follows the original file after replacement instead of launching the old generation', async () => {
    const f = await fixture()
    await writeFile(f.image, 'a different package with a new generation')
    expect(linuxDesktopAppImageLaunch(f.executable, {}, 'linux')?.executable).toBe(f.image)
  })

  it('refuses a missing recorded source instead of silently reopening the stale generation', async () => {
    const f = await fixture()
    await rm(f.image)
    expect(() => linuxDesktopAppImageLaunch(f.executable, {}, 'linux')).toThrow(
      'original Orca AppImage is missing'
    )
  })

  it('leaves ordinary unpacked executables and other platforms on their existing launch path', async () => {
    const f = await fixture()
    expect(linuxDesktopAppImageLaunch('/opt/orca/orca-ide', {}, 'linux')).toBeNull()
    expect(linuxDesktopAppImageLaunch(f.executable, {}, 'darwin')).toBeNull()
    expect(linuxDesktopAppImageLaunch(f.executable, {}, 'win32')).toBeNull()
  })
})
