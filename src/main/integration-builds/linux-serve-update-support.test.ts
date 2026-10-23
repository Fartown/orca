import { afterEach, describe, expect, it, vi } from 'vitest'
const identity = vi.hoisted(() => vi.fn())
vi.mock('../appimage-runtime-identity', () => ({ resolveAppImageRuntimeIdentity: identity }))
import { hasLinuxServeUpdateSupervisor } from './linux-serve-update-support'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const connected = Object.getOwnPropertyDescriptor(process, 'connected')
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  if (connected) {
    Object.defineProperty(process, 'connected', connected)
  } else {
    Reflect.deleteProperty(process, 'connected')
  }
  identity.mockReset()
})

describe('Linux update supervisor eligibility', () => {
  it('requires Linux, a live IPC parent and validated AppImage identity', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    Object.defineProperty(process, 'connected', { value: true, configurable: true })
    identity.mockReturnValue({ appImagePath: '/opt/orca/Orca.AppImage' })
    expect(hasLinuxServeUpdateSupervisor()).toBe(true)
    Object.defineProperty(process, 'connected', { value: false, configurable: true })
    expect(hasLinuxServeUpdateSupervisor()).toBe(false)
    Object.defineProperty(process, 'connected', { value: true, configurable: true })
    identity.mockReturnValue(null)
    expect(hasLinuxServeUpdateSupervisor()).toBe(false)
    identity.mockReturnValue({ appImagePath: '/opt/orca/Orca.AppImage' })
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(hasLinuxServeUpdateSupervisor()).toBe(false)
  })
})
