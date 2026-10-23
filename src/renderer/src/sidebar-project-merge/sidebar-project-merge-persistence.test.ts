import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultUIState } from '../../../shared/constants'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import {
  adoptSidebarProjectMerges,
  saveSidebarProjectMerges,
  subscribeSidebarProjectMerges,
  useSidebarProjectMergeStore
} from './sidebar-project-merge-store'

const merges = [
  {
    id: 'workspace',
    name: 'workspace',
    members: [
      { hostId: 'local' as const, repoId: 'local-workspace' },
      { hostId: 'runtime:mini' as const, repoId: 'mini-workspace' }
    ]
  }
]

describe('sidebar merge persistence', () => {
  let ui: PersistedUIState
  let changed: (value: PersistedUIState) => void
  const unsubscribe = vi.fn()
  beforeEach(() => {
    ui = { ...getDefaultUIState(), sidebarProjectMerges: [] }
    changed = () => {}
    useSidebarProjectMergeStore.setState({
      merges: [],
      supported: false,
      saving: false,
      error: null
    })
    vi.stubGlobal('window', {
      api: {
        ui: {
          get: vi.fn(async () => ui),
          setWithAck: vi.fn(async (updates: Partial<PersistedUIState>) => {
            ui = { ...ui, ...updates }
            changed(ui)
          }),
          onStateChanged: vi.fn((listener: typeof changed) => {
            changed = listener
            return unsubscribe
          })
        }
      }
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('saves through the UI API, verifies readback, and restores the merge on reload', async () => {
    adoptSidebarProjectMerges(ui)
    await saveSidebarProjectMerges(merges)
    expect(ui.sidebarProjectMerges).toEqual(merges)
    expect(useSidebarProjectMergeStore.getState()).toMatchObject({
      merges,
      saving: false,
      error: null
    })
    useSidebarProjectMergeStore.setState({ merges: [], supported: false })
    const stop = subscribeSidebarProjectMerges()
    await vi.waitFor(() => expect(useSidebarProjectMergeStore.getState().merges).toEqual(merges))
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not report success when the host drops the write', async () => {
    adoptSidebarProjectMerges(ui)
    vi.mocked(window.api.ui.setWithAck)?.mockResolvedValue(undefined)
    await expect(saveSidebarProjectMerges(merges)).rejects.toThrow('not saved')
    expect(useSidebarProjectMergeStore.getState()).toMatchObject({ merges: [], saving: false })
  })

  it('does not write the new preference to an older host', async () => {
    adoptSidebarProjectMerges(getDefaultUIState())
    await expect(saveSidebarProjectMerges(merges)).rejects.toThrow('does not support')
    expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
  })

  it('does not let an older initial read overwrite a newer UI event', async () => {
    let resolveRead: (value: PersistedUIState) => void = () => {}
    vi.mocked(window.api.ui.get).mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve
      })
    )
    const stop = subscribeSidebarProjectMerges()
    changed({ ...ui, sidebarProjectMerges: merges })
    resolveRead(ui)
    await Promise.resolve()
    expect(useSidebarProjectMergeStore.getState().merges).toEqual(merges)
    stop()
  })
})
