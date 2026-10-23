import { create } from 'zustand'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import {
  normalizeSidebarProjectMerges,
  type SidebarProjectMerge
} from '../../../shared/sidebar-project-merge/sidebar-project-merges'

type MergeState = {
  merges: SidebarProjectMerge[]
  supported: boolean
  saving: boolean
  error: string | null
}

export const useSidebarProjectMergeStore = create<MergeState>(() => ({
  merges: [],
  supported: false,
  saving: false,
  error: null
}))

export function adoptSidebarProjectMerges(ui: Partial<PersistedUIState>): void {
  const merges = normalizeSidebarProjectMerges(ui.sidebarProjectMerges)
  const supported = 'sidebarProjectMerges' in ui
  const current = useSidebarProjectMergeStore.getState()
  if (
    supported === current.supported &&
    JSON.stringify(merges) === JSON.stringify(current.merges)
  ) {
    return
  }
  useSidebarProjectMergeStore.setState({ merges, supported })
}

export function subscribeSidebarProjectMerges(): () => void {
  if (!window.api?.ui?.onStateChanged || !window.api.ui.get) {
    return () => {}
  }
  let active = true
  let events = 0
  const unsubscribe = window.api.ui.onStateChanged((ui) => {
    events += 1
    if (active) {
      adoptSidebarProjectMerges(ui)
    }
  })
  void window.api.ui
    .get()
    .then((ui) => {
      if (active && events === 0) {
        adoptSidebarProjectMerges(ui)
      }
    })
    .catch((error: unknown) => {
      if (active) {
        useSidebarProjectMergeStore.setState({ error: String(error) })
      }
    })
  return () => {
    active = false
    unsubscribe()
  }
}

export async function saveSidebarProjectMerges(
  value: readonly SidebarProjectMerge[]
): Promise<void> {
  const current = useSidebarProjectMergeStore.getState()
  if (!current.supported) {
    throw new Error('This Orca host does not support project display merges.')
  }
  if (current.saving) {
    throw new Error('A project display merge is already being saved.')
  }
  const merges = normalizeSidebarProjectMerges(value)
  const setWithAck = window.api.ui.setWithAck
  if (!setWithAck) {
    throw new Error('This Orca host cannot confirm project display merge writes.')
  }
  useSidebarProjectMergeStore.setState({ saving: true, error: null })
  try {
    await setWithAck({ sidebarProjectMerges: merges })
    const persisted = await window.api.ui.get()
    if (
      JSON.stringify(normalizeSidebarProjectMerges(persisted.sidebarProjectMerges)) !==
      JSON.stringify(merges)
    ) {
      throw new Error('The project display merge was not saved by this Orca host.')
    }
    adoptSidebarProjectMerges(persisted)
  } catch (error) {
    useSidebarProjectMergeStore.setState({ error: String(error) })
    throw error
  } finally {
    useSidebarProjectMergeStore.setState({ saving: false })
  }
}
