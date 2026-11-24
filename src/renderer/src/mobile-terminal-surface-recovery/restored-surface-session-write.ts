import { useAppStore } from '@/store'
import { shouldPersistWorkspaceSession } from '@/lib/workspace/persistence/workspace-session'
import { buildWorkspaceSessionPatch } from '@/lib/workspace/persistence/workspace-session-patch'
import { patchWorkspaceSessionByHost } from '@/lib/workspace/persistence/workspace-session-host-persistence'
import { windowAcknowledgedSessionEntries } from '@/lib/workspace/persistence/workspace-session-acknowledged-entries'

const RESTORED_SURFACE_SESSION_FIELDS = ['tabsByWorktree', 'terminalLayoutsByTabId'] as const

/** Main refuses to attach a pane its saved session lacks, so the recreated tab reaches main before its pane connects. */
export function writeRestoredSurfaceToMain(): void {
  const session = typeof window === 'undefined' ? undefined : window.api?.session
  const state = useAppStore.getState()
  if (!session || !shouldPersistWorkspaceSession(state)) {
    return
  }
  const patch = buildWorkspaceSessionPatch(state, RESTORED_SURFACE_SESSION_FIELDS)
  // The debounced writer resends these fields on failure; this write only has to precede the attach.
  void patchWorkspaceSessionByHost(
    session,
    patch,
    state,
    windowAcknowledgedSessionEntries
  ).written.catch((error: unknown) =>
    console.warn('[session] restored terminal tab write failed:', error)
  )
}
