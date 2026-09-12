import { beforeEach, expect, it, vi } from 'vitest'
import {
  getDispatchHandler,
  notificationCtorMock,
  notificationIsSupportedMock,
  resetNotificationDispatchMocks
} from '../ipc/notifications-test-harness'
import { registerNotificationHandlers } from '../ipc/notifications'

vi.mock('electron', async () =>
  (await import('../ipc/notifications-test-harness')).createElectronModuleMock()
)
vi.mock('../ipc/notification-authorization-status', async () =>
  (await import('../ipc/notifications-test-harness')).createNotificationAuthorizationModuleMock()
)
vi.mock('../ipc/ui', async () =>
  (await import('../ipc/notifications-test-harness')).createTrustedUIRendererModuleMock()
)
vi.mock('../tray/system-tray', async () =>
  (await import('../ipc/notifications-test-harness')).createSystemTrayModuleMock()
)

beforeEach(resetNotificationDispatchMocks)

it.each([true, false])(
  'uses the same captured name, body and dismissal identity for mobile and native (supported=%s)',
  async (supported) => {
    notificationIsSupportedMock.mockReturnValue(supported)
    const dispatchMobileNotification = vi.fn()
    registerNotificationHandlers(
      {
        getSettings: () => ({
          notifications: {
            enabled: true,
            agentTaskComplete: true,
            terminalBell: true,
            suppressWhenFocused: false
          }
        })
      } as never,
      { dispatchMobileNotification } as never
    )
    const result = await getDispatchHandler()(
      {},
      {
        source: 'agent-task-complete',
        worktreeId: 'folder:f',
        notificationId: 'captured-event-A',
        paneKey: 'pane-A',
        worktreeLabel: 'Folder',
        sessionTitle: 'Provider name',
        agentType: 'codex',
        agentState: 'done',
        agentPrompt: '继续',
        agentLastAssistantMessage: 'The patch is ready.'
      }
    )
    expect(dispatchMobileNotification).toHaveBeenCalledExactlyOnceWith({
      type: 'notification',
      emittedAt: expect.any(Number),
      source: 'agent-task-complete',
      worktreeId: 'folder:f',
      notificationId: 'captured-event-A',
      title: 'Provider name · Folder - Codex finished',
      body: 'The patch is ready.',
      agentState: 'done'
    })
    if (supported) {
      expect(notificationCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Provider name · Folder - Codex finished',
          body: 'The patch is ready.'
        })
      )
    } else {
      expect(result).toEqual({ delivered: false, reason: 'not-supported' })
      expect(notificationCtorMock).not.toHaveBeenCalled()
    }
  }
)
