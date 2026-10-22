// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ArtifactShareHostListing } from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import LanArtifactsPage from './LanArtifactsPage'
import { TooltipProvider } from '@/components/ui/tooltip'

const listings = vi.hoisted(() =>
  Array.from({ length: 13_692 }, (_, index) => ({
    host: { executionHostId: `ssh:node-${index}`, label: `node-${String(index).padStart(5, '0')}` },
    service: { state: 'unverifiable', reason: 'disconnected' },
    workspaces: []
  }))
)
vi.mock('./use-lan-artifact-hosts', () => ({
  useLanArtifactHosts: () => ({
    hosts: listings,
    loading: false,
    error: null,
    stoppingToken: null,
    reload: vi.fn(),
    stopWorkspace: vi.fn()
  })
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => vi.fn()
}))
vi.mock('./LanArtifactHostSection', () => ({
  LanArtifactHostSection: ({ listing }: { listing: ArtifactShareHostListing }) => (
    <div data-testid="host-row">{listing.host.label}</div>
  )
}))
afterEach(cleanup)

it('bounds host sections and searches every configured host rather than dropping the tail', () => {
  render(
    <TooltipProvider>
      <LanArtifactsPage />
    </TooltipProvider>
  )
  expect(screen.getAllByTestId('host-row')).toHaveLength(50)
  fireEvent.change(screen.getByPlaceholderText('Search hosts…'), {
    target: { value: 'node-13691' }
  })
  expect(screen.getAllByTestId('host-row')).toHaveLength(1)
  expect(screen.getByTestId('host-row').textContent).toBe('node-13691')
  fireEvent.change(screen.getByPlaceholderText('Search hosts…'), { target: { value: 'no-match' } })
  expect(screen.queryAllByTestId('host-row')).toHaveLength(0)
  expect(screen.getByText('No hosts match.')).toBeTruthy()
})
