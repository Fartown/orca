import { mkdtemp, mkdir, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appImageNamespaceKey, resolveAppImageCacheKey } from '../../shared/appimage-cache-identity'
import {
  resolveAppImageBuildWatch,
  serveAppImageAttemptPath
} from '../runtime/serve-appimage-update'
import { finishLinuxServeUpdate, linuxServeUpdateEnvironment } from './linux-serve-update'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orca-linux-update-'))
  roots.push(root)
  const image = join(root, 'Orca.AppImage')
  await writeFile(image, 'old package')
  const namespace = join(root, 'cache', appImageNamespaceKey(image))
  const payload = join(namespace, resolveAppImageCacheKey(image)!)
  const executable = join(payload, 'orca-ide')
  const stamp = join(payload, 'resources/app.asar.unpacked/out/package.json')
  await mkdir(dirname(stamp), { recursive: true })
  await writeFile(stamp, JSON.stringify({ version: '1.0.0' }))
  await writeFile(join(namespace, 'source-appimage'), image)
  const run = vi.fn(async () => ({
    code: 0,
    stdout: '1.1.0\n',
    stderr: '',
    signal: null,
    timedOut: false
  }))
  const execve = vi.fn()
  const controller = new AbortController()
  const options = {
    executable,
    targetVersion: '1.1.0',
    userDataPath: root,
    platform: 'linux' as const,
    env: { ORCA_USER_DATA_PATH: root },
    argv: [executable, '/cli/index.js', 'serve', '--supervise'],
    signal: controller.signal,
    run,
    execve,
    log: vi.fn()
  }
  async function replace() {
    await writeFile(`${image}.new`, 'new package')
    await utimes(`${image}.new`, new Date(0), new Date(0))
    await rename(`${image}.new`, image)
  }
  return { root, executable, image, options, controller, run, execve, replace }
}

describe('Linux AppImage supervised update', () => {
  it('recovers the source for a cached service but excludes unsupervised and other platforms', async () => {
    const f = await fixture()
    expect(linuxServeUpdateEnvironment(f.executable, true, {}, 'linux')).toEqual({
      APPIMAGE: f.image,
      APPDIR: dirname(f.executable),
      APPIMAGE_EXTRACT_AND_RUN: '1'
    })
    expect(linuxServeUpdateEnvironment(f.executable, false, {}, 'linux')).toBeNull()
    expect(linuxServeUpdateEnvironment(f.executable, true, {}, 'win32')).toBeNull()
    expect(linuxServeUpdateEnvironment('/opt/orca/orca-ide', true, {}, 'linux')).toBeNull()
  })

  it('lets the installed target proceed to the existing IPC readiness verification', async () => {
    const f = await fixture()
    expect(await finishLinuxServeUpdate({ ...f.options, targetVersion: '1.0.0' })).toBe(true)
    expect(f.run).not.toHaveBeenCalled()
    expect(f.execve).not.toHaveBeenCalled()
    expect(await finishLinuxServeUpdate({ ...f.options, platform: 'darwin' })).toBeNull()
  })

  it('verifies and executes the replacement at the same path, preserving profile and serve arguments', async () => {
    const f = await fixture()
    await f.replace()
    await finishLinuxServeUpdate(f.options)
    expect(f.run).toHaveBeenCalledWith(
      expect.objectContaining({ program: f.image, args: ['--version'] })
    )
    expect(f.execve).toHaveBeenCalledWith(
      f.image,
      [f.image, 'serve', '--supervise'],
      expect.objectContaining({
        ORCA_USER_DATA_PATH: f.root,
        APPIMAGE_EXTRACT_AND_RUN: '1'
      })
    )
    expect(JSON.parse(await readFile(serveAppImageAttemptPath(f.root), 'utf8')).candidateKey).toBe(
      resolveAppImageCacheKey(f.image)
    )
  })

  it('rejects a replacement whose actual version differs from the request', async () => {
    const f = await fixture()
    await f.replace()
    f.run.mockResolvedValue({ code: 0, stdout: '9.9.9', stderr: '', signal: null, timedOut: false })
    expect(await finishLinuxServeUpdate(f.options)).toBe(false)
    expect(f.execve).not.toHaveBeenCalled()
  })

  it('uses the pre-install identity when the supervisor runs from a mounted AppImage', async () => {
    const f = await fixture()
    const executable = join(f.root, 'mount', 'orca-ide')
    const env = { APPIMAGE: f.image, APPDIR: dirname(executable) }
    const watch = resolveAppImageBuildWatch(executable, env, 'linux')
    await f.replace()
    expect(watch?.runningKey).not.toBe(resolveAppImageCacheKey(f.image))
    await finishLinuxServeUpdate({ ...f.options, executable, env, watch })
    expect(f.execve).toHaveBeenCalledWith(
      f.image,
      [f.image, 'serve', '--supervise'],
      expect.objectContaining({ APPIMAGE_EXTRACT_AND_RUN: '1' })
    )
  })

  it('does not launch when probing fails or a stop arrives during the probe', async () => {
    const f = await fixture()
    await f.replace()
    f.run.mockRejectedValueOnce(new Error('cannot execute'))
    expect(await finishLinuxServeUpdate(f.options)).toBe(false)
    f.run.mockImplementationOnce(async () => {
      f.controller.abort()
      return { code: 0, stdout: '1.1.0', stderr: '', signal: null, timedOut: false }
    })
    expect(await finishLinuxServeUpdate(f.options)).toBe(false)
    expect(f.execve).not.toHaveBeenCalled()
  })

  it('does not probe or restart a stopped service', async () => {
    const f = await fixture()
    await f.replace()
    f.controller.abort()
    expect(await finishLinuxServeUpdate(f.options)).toBe(false)
    expect(f.run).not.toHaveBeenCalled()
    expect(f.execve).not.toHaveBeenCalled()
  })
})
