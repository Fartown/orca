import { vi } from 'vitest'
import type { Mock } from 'vitest'

// Upstream retired its notification IPC harness (#43339); the session-name delivery suite keeps its own.

/** Unconstrained spy; annotated explicitly so declaration emit never names @vitest/spy internals. */
export type NotificationSpy = Mock<(...args: never[]) => unknown>

const removeHandlerMock: NotificationSpy = vi.fn()
const handleMock: NotificationSpy = vi.fn()
const notificationShowMock: NotificationSpy = vi.fn()
const notificationOnMock: NotificationSpy = vi.fn()
const notificationOnceMock: NotificationSpy = vi.fn()
export const notificationCtorMock: NotificationSpy = vi.fn(function () {
  return {
    show: notificationShowMock,
    close: vi.fn(),
    on: notificationOnMock,
    once: notificationOnceMock,
    removeListener: vi.fn(),
    // Upstream's Linux show path reports an unanswered service check through emit('failed').
    emit: vi.fn()
  }
})
export const notificationIsSupportedMock = vi.fn(() => true)
const getAllWindowsMock = vi.fn(() => [])
const getTrustedUIRendererWindowMock: NotificationSpy = vi.fn()
const readAuthorizationStatusMock = vi.fn(
  (): Promise<'authorized' | 'denied' | 'not-determined' | 'unknown' | null> =>
    Promise.resolve(null)
)

export function createElectronModuleMock(): Record<string, unknown> {
  return {
    ipcMain: { removeHandler: removeHandlerMock, handle: handleMock },
    Notification: Object.assign(notificationCtorMock, {
      isSupported: notificationIsSupportedMock,
      remove: vi.fn(),
      removeGroup: vi.fn()
    }),
    BrowserWindow: { getAllWindows: getAllWindowsMock },
    app: { focus: vi.fn() },
    powerMonitor: { getSystemIdleState: vi.fn(() => 'active'), on: vi.fn() },
    shell: { openExternal: vi.fn() }
  }
}

export function createNotificationAuthorizationModuleMock(): Record<string, unknown> {
  return { readNotificationAuthorizationStatus: readAuthorizationStatusMock }
}

export function createTrustedUIRendererModuleMock(): Record<string, unknown> {
  return { getTrustedUIRendererWindow: getTrustedUIRendererWindowMock }
}

// Stub tray imports to keep the suite independent of app-icon/toolkit setup.
export function createSystemTrayModuleMock(): Record<string, unknown> {
  return { setTrayAttention: vi.fn() }
}

export function resetNotificationDispatchMocks(): void {
  removeHandlerMock.mockReset()
  handleMock.mockReset()
  notificationCtorMock.mockClear()
  notificationShowMock.mockClear()
  notificationOnMock.mockClear()
  notificationOnceMock.mockClear()
  notificationIsSupportedMock.mockReset()
  notificationIsSupportedMock.mockReturnValue(true)
  readAuthorizationStatusMock.mockReset()
  readAuthorizationStatusMock.mockResolvedValue(null)
  getAllWindowsMock.mockReset()
  getAllWindowsMock.mockReturnValue([])
  getTrustedUIRendererWindowMock.mockReset()
  getTrustedUIRendererWindowMock.mockReturnValue(null)
}

export function getDispatchHandler(): (event: unknown, args: unknown) => unknown {
  const call = handleMock.mock.calls.find((c: unknown[]) => c[0] === 'notifications:dispatch')
  if (!call) {
    throw new Error('notifications:dispatch handler not registered')
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: selected by its exact channel.
  return call[1] as (event: unknown, args: unknown) => unknown
}
