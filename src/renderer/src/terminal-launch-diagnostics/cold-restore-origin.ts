import { useAppStore } from '@/store'
import type { ColdRestoreAgentResumeStartup } from '@/components/terminal-pane/pty-connection/fresh-spawn-types'
import { recordTerminalLaunchOrigin } from './launch-origin'

type ColdRestoreSession = {
  deps: { tabId: string; worktreeId: string }
  pane: { leafId: string }
  // The upstream session bag carries cacheKey untyped.
  cacheKey?: string
}

// Why once per pane session: candidate evidence scans the workspace's tabs, and upstream bounds retry work per tab.
const candidateScannedSessions = new WeakSet<ColdRestoreSession>()

export function recordColdRestoreResumeOrigin(
  session: ColdRestoreSession,
  startup: ColdRestoreAgentResumeStartup | null
): void {
  const scanCandidates = !candidateScannedSessions.has(session)
  candidateScannedSessions.add(session)
  recordTerminalLaunchOrigin(
    'cold-restore-resume',
    {
      ...startup,
      tabId: session.deps.tabId,
      leafId: session.pane.leafId,
      paneKey: session.cacheKey,
      worktreeId: session.deps.worktreeId
    },
    scanCandidates ? useAppStore.getState() : undefined
  )
}
