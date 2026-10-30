import { afterEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  identity: vi.fn<() => { appImagePath: string } | null>(),
  packageType: vi.fn<() => string>()
}))
vi.mock('../appimage-runtime-identity', () => ({ resolveAppImageRuntimeIdentity: mock.identity }))
vi.mock('../linux-update-package-type', () => ({ getLinuxPackageType: mock.packageType }))
import { linuxAppImageUpdateUnavailableMessage } from './linux-appimage-update-availability'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
afterEach(() => {
  if (platform) {
    Object.defineProperty(process, 'platform', platform)
  }
  vi.resetAllMocks()
})

describe('Linux AppImage update availability', () => {
  it('rejects an extracted AppImage without a valid source identity', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    mock.packageType.mockReturnValue('non-root')
    mock.identity.mockReturnValue(null)
    expect(linuxAppImageUpdateUnavailableMessage()).toContain('original AppImage')
  })

  it('accepts a validated source and leaves distro packages on their existing policy', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    mock.packageType.mockReturnValue('non-root')
    mock.identity.mockReturnValue({ appImagePath: '/opt/Orca.AppImage' })
    expect(linuxAppImageUpdateUnavailableMessage()).toBeNull()
    mock.identity.mockReturnValue(null)
    mock.packageType.mockReturnValue('deb')
    expect(linuxAppImageUpdateUnavailableMessage()).toBeNull()
  })

  it.each(['darwin', 'win32'])('does not apply Linux identity rules on %s', (value) => {
    Object.defineProperty(process, 'platform', { value })
    expect(linuxAppImageUpdateUnavailableMessage()).toBeNull()
    expect(mock.identity).not.toHaveBeenCalled()
  })
})
