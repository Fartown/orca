// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { createRef, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PopoverMocks = {
  onOpenChange: ((open: boolean) => void) | null
  lookup: ReturnType<typeof vi.fn>
  share: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted<PopoverMocks>(() => ({
  onOpenChange: null,
  lookup: vi.fn(),
  share: vi.fn()
}))

// Why a stand-in Popover: it renders content only while open, so the tests read the open state the
// button drives rather than Radix portal timing.
vi.mock('@/components/ui/popover', async () => {
  const { createContext, useContext } = await import('react')
  const OpenContext = createContext(false)
  return {
    Popover: ({
      children,
      open,
      onOpenChange
    }: {
      children: ReactNode
      open: boolean
      onOpenChange: (open: boolean) => void
    }) => {
      mocks.onOpenChange = onOpenChange
      return <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    },
    PopoverAnchor: () => <span data-testid="popover-anchor" />,
    PopoverContent: ({ children }: { children: ReactNode }) =>
      useContext(OpenContext) ? <div data-testid="popover-content">{children}</div> : null,
    PopoverTrigger: ({ children }: { children: ReactNode }) => (
      <span onClick={() => mocks.onOpenChange?.(true)}>{children}</span>
    )
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettingsTarget: vi.fn(), openSettingsPage: vi.fn() })
}))

vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => vi.fn()
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

vi.mock('../client/lan-artifact-share-client', () => ({
  lookupLanArtifactShare: mocks.lookup,
  shareLanArtifact: mocks.share,
  stopLanArtifactWorkspace: vi.fn(),
  lanArtifactShareErrorCode: () => null,
  lanArtifactShareErrorMessage: (error: unknown) => String(error)
}))

import { LanArtifactShareButton } from './LanArtifactShareButton'

const LABEL = 'Share on local network'
const TARGET = { executionHostId: 'local', workspaceRoot: '/repo', sourcePath: '/repo/index.html' }
const UNSHARED_LOOKUP = {
  host: { executionHostId: 'local', label: 'This Mac' },
  service: { state: 'serving', port: 4321, ip: '192.168.1.2', ipCandidates: [] },
  file: {
    workspace: null,
    rootPath: '/repo',
    workspaceLabel: 'repo',
    relativePath: 'index.html',
    url: null
  }
}

function resolver() {
  return vi.fn(() => ({ ok: true as const, target: TARGET }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onOpenChange = null
  mocks.lookup.mockResolvedValue(UNSHARED_LOOKUP)
})

afterEach(cleanup)

describe('LanArtifactShareButton', () => {
  it('owns its trigger and resolves the target once when opened', async () => {
    const user = userEvent.setup()
    const resolveTarget = resolver()
    render(<LanArtifactShareButton resolveTarget={resolveTarget} />)

    expect(screen.queryByTestId('popover-content')).toBeNull()
    expect(resolveTarget).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: LABEL }))
    expect(await screen.findByTestId('popover-content')).toBeInTheDocument()
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledWith(TARGET))
    expect(resolveTarget).toHaveBeenCalledTimes(1)
  })

  it('lets a folding toolbar own the open state and anchor', async () => {
    const user = userEvent.setup()
    const anchorRef = createRef<HTMLButtonElement>()
    const onOpenChange = vi.fn()
    const resolveTarget = resolver()
    let releaseShare: (() => void) | undefined
    mocks.share.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseShare = () => resolve(UNSHARED_LOOKUP)
        })
    )
    render(
      <>
        <button ref={anchorRef}>Overflow</button>
        <LanArtifactShareButton
          resolveTarget={resolveTarget}
          anchorRef={anchorRef}
          open
          onOpenChange={onOpenChange}
        />
      </>
    )

    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
    expect(screen.getByTestId('popover-anchor')).toBeInTheDocument()
    expect(screen.getByTestId('popover-content')).toBeInTheDocument()
    await waitFor(() => expect(resolveTarget).toHaveBeenCalledTimes(1))

    act(() => mocks.onOpenChange?.(false))
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)

    await user.click(await screen.findByRole('button', { name: 'Generate link' }))
    await waitFor(() => expect(mocks.share).toHaveBeenCalledWith(TARGET))
    act(() => mocks.onOpenChange?.(false))
    // Why: closing mid-share would hide the result of a link the owner is still creating.
    expect(onOpenChange).toHaveBeenCalledTimes(1)

    await act(async () => releaseShare?.())
  })
})
