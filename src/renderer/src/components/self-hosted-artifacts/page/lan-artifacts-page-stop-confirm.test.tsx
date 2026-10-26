// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LanArtifactsPage from './LanArtifactsPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'

const mocks = vi.hoisted(() => ({ stopWorkspace: vi.fn(), confirm: vi.fn() }))
const workspace = { label: 'repo', token: 'token-1' }
vi.mock('./use-lan-artifact-hosts', () => ({
  useLanArtifactHosts: () => ({
    hosts: [
      {
        host: { executionHostId: 'local', label: 'This computer' },
        service: { state: 'serving' },
        workspaces: [workspace]
      }
    ],
    loading: false,
    error: null,
    stoppingToken: null,
    reload: vi.fn(),
    stopWorkspace: mocks.stopWorkspace
  })
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => mocks.confirm
}))
vi.mock('./LanArtifactHostSection', () => ({
  LanArtifactHostSection: ({ onStopWorkspace }: { onStopWorkspace: (w: unknown) => void }) => (
    <button type="button" onClick={() => onStopWorkspace(workspace)}>
      stop
    </button>
  )
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage(skipDeleteArtifactConfirm: boolean): void {
  useAppStore.setState({ settings: { ...getDefaultSettings('/tmp'), skipDeleteArtifactConfirm } })
  render(
    <TooltipProvider>
      <LanArtifactsPage />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'stop' }))
}

it('asks before stopping a share by default', async () => {
  mocks.confirm.mockResolvedValue(false)
  renderPage(false)
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
  expect(mocks.stopWorkspace).not.toHaveBeenCalled()
})

it('stops without asking when General → Ask Before Deleting Artifacts is off', async () => {
  renderPage(true)
  await waitFor(() => expect(mocks.stopWorkspace).toHaveBeenCalledWith('local', 'token-1'))
  expect(mocks.confirm).not.toHaveBeenCalled()
})
