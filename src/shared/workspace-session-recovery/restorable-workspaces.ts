import type { ExecutionHostId } from '../execution-host'
import { normalizeWorkspaceSessionKeyToWorkspaceId } from '../workspace-scope'

type WorkspaceContent = {
  tabsByWorktree?: Readonly<Record<string, readonly unknown[]>>
  openFilesByWorktree?: Readonly<Record<string, readonly unknown[]>>
  browserTabsByWorktree?: Readonly<Record<string, readonly unknown[]>>
  browserPagesByWorkspace?: Readonly<Record<string, readonly unknown[]>>
  unifiedTabs?: Readonly<Record<string, readonly unknown[]>>
  sleepingAgentSessionsByPaneKey?: Readonly<Record<string, { worktreeId: string }>>
}

export function restorableWorkspaceIds(session: WorkspaceContent): Set<string> {
  const ids = new Set<string>()
  for (const field of [
    session.tabsByWorktree,
    session.openFilesByWorktree,
    session.browserTabsByWorktree,
    session.browserPagesByWorkspace,
    session.unifiedTabs
  ]) {
    for (const [key, entries] of Object.entries(field ?? {})) {
      if (entries.length > 0) {
        ids.add(normalizeWorkspaceSessionKeyToWorkspaceId(key))
      }
    }
  }
  for (const record of Object.values(session.sleepingAgentSessionsByPaneKey ?? {})) {
    ids.add(normalizeWorkspaceSessionKeyToWorkspaceId(record.worktreeId))
  }
  return ids
}

export function restorableRuntimeSessionOwners(
  session: WorkspaceContent,
  owners: Record<string, ExecutionHostId>
): Record<string, ExecutionHostId> {
  const ids = restorableWorkspaceIds(session)
  return Object.fromEntries(
    Object.entries(owners).filter(([key]) =>
      ids.has(normalizeWorkspaceSessionKeyToWorkspaceId(key))
    )
  )
}
