import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { StructuredCreationSessionOutcome } from '@/lib/worktree-creation-structured-session'

/** What workspace creation hands back once the workspace exists; the shape of its completion args. */
export type WorktreeCreationCompleted = {
  creationId: string
  request: Pick<WorktreeCreationRequest, 'agent' | 'executionHostId' | 'workspaceRunContext'>
  worktreeId: string
  structuredLaunchAccepted: boolean
  structuredSessionOutcome?: Promise<StructuredCreationSessionOutcome>
  primaryTabId: string | null
  startupTerminalTabId?: string
  backendSpawned: boolean
}

type Listener = (completed: WorktreeCreationCompleted) => void

const listeners = new Set<Listener>()

/** Called by workspace creation as it completes; failed or cancelled creations never call it. */
export function notifyWorktreeCreationCompleted(completed: WorktreeCreationCompleted): void {
  for (const listener of listeners) {
    try {
      listener(completed)
    } catch (error) {
      console.error('local tasks: creation listener failed', error)
    }
  }
}

export function subscribeWorktreeCreationCompleted(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
