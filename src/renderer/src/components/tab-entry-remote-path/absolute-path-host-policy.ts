import { getFolderWorkspaceConnectionId } from '@/lib/folder-workspace-connection'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import type { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { TabEntryOptionsContext } from '../tab-bar/tab-create-entry-classifier'
import { getTabEntryFileOperationContext } from '../tab-bar/tab-create-entry-local-path'
import type { TabEntryLocalPlatform } from '../tab-bar/tab-create-entry-path-validation'

type AppState = ReturnType<typeof useAppStore.getState>

/**
 * Which host owns the absolute paths typed into the tab create entry, and how they are validated.
 * Remote hosts are always POSIX here (Windows SSH hosts are out of scope, D-003); the client
 * platform only decides the local case.
 */
export type TabEntryAbsolutePathHostPolicy =
  | { kind: 'blocked'; reason: 'unknown-worktree' | 'unresolved' | 'skipped' }
  | { kind: 'local'; pathPlatform: TabEntryLocalPlatform }
  | { kind: 'ssh'; connectionId: string; pathPlatform: 'posix' }
  | { kind: 'runtime'; environmentId: string; worktreePath: string; pathPlatform: 'posix' }

export const TAB_ENTRY_ABSOLUTE_PATH_HOST_CHANGED_MESSAGE =
  'The workspace host changed while opening this file. Try again.'

// Stable references: zustand selectors must not return a fresh object per call.
const BLOCKED_UNKNOWN_WORKTREE: TabEntryAbsolutePathHostPolicy = Object.freeze({
  kind: 'blocked',
  reason: 'unknown-worktree'
})
const BLOCKED_UNRESOLVED: TabEntryAbsolutePathHostPolicy = Object.freeze({
  kind: 'blocked',
  reason: 'unresolved'
})
const BLOCKED_SKIPPED: TabEntryAbsolutePathHostPolicy = Object.freeze({
  kind: 'blocked',
  reason: 'skipped'
})

function getClientPathPlatform(): TabEntryLocalPlatform {
  return getRendererAppPlatform() === 'win32' ? 'windows' : 'posix'
}

export function resolveTabEntryAbsolutePathHostPolicy(
  state: AppState,
  worktreeId: string
): TabEntryAbsolutePathHostPolicy {
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    return BLOCKED_UNKNOWN_WORKTREE
  }
  const workspaceKey = parseWorkspaceKey(worktreeId)
  if (workspaceKey?.type === 'folder') {
    // Why: a folder workspace has no published worktree row, so an unhydrated group or mixed
    // local/SSH repo ownership must stay closed instead of resolving to whichever host answers.
    if (
      getResolvedExecutionHostIdForWorktree(state, worktreeId) === null ||
      getFolderWorkspaceConnectionId(state, workspaceKey.folderWorkspaceId) === undefined
    ) {
      return BLOCKED_UNRESOLVED
    }
  }
  let context: ReturnType<typeof getTabEntryFileOperationContext>
  try {
    context = getTabEntryFileOperationContext(state, worktreeId, worktree.path)
  } catch {
    return BLOCKED_UNRESOLVED
  }
  const environmentId = context.settings?.activeRuntimeEnvironmentId?.trim()
  if (environmentId) {
    return { kind: 'runtime', environmentId, worktreePath: worktree.path, pathPlatform: 'posix' }
  }
  const connectionId = context.connectionId?.trim()
  if (connectionId) {
    return { kind: 'ssh', connectionId, pathPlatform: 'posix' }
  }
  return { kind: 'local', pathPlatform: getClientPathPlatform() }
}

/** Same owning host: the fail-closed re-checks around each await compare against this. */
export function isSameTabEntryAbsolutePathHost(
  expected: TabEntryAbsolutePathHostPolicy,
  current: TabEntryAbsolutePathHostPolicy
): boolean {
  if (expected.kind === 'blocked' || current.kind === 'blocked') {
    return false
  }
  if (expected.kind !== current.kind) {
    return false
  }
  if (expected.kind === 'ssh' && current.kind === 'ssh') {
    return expected.connectionId === current.connectionId
  }
  if (expected.kind === 'runtime' && current.kind === 'runtime') {
    return expected.environmentId === current.environmentId
  }
  return true
}

export type TabEntryAbsolutePathContext = {
  allowAbsolutePaths: boolean
  localPlatform: TabEntryLocalPlatform
  absolutePathScope?: TabEntryOptionsContext['absolutePathScope']
}

export function toTabEntryAbsolutePathContext(
  policy: TabEntryAbsolutePathHostPolicy
): TabEntryAbsolutePathContext {
  if (policy.kind === 'blocked') {
    return { allowAbsolutePaths: false, localPlatform: getClientPathPlatform() }
  }
  return {
    allowAbsolutePaths: true,
    localPlatform: policy.pathPlatform,
    // Why: runtime file RPCs are worktree-scoped, so the classifier turns paths outside the
    // worktree into a status row instead of a request that can only fail.
    ...(policy.kind === 'runtime'
      ? { absolutePathScope: { worktreePath: policy.worktreePath } }
      : {})
  }
}

type OwnerSlices = Pick<
  AppState,
  | 'settings'
  | 'repos'
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'runtimeEnvironments'
  | 'runtimeEnvironmentCatalogHydrated'
  | 'removedRuntimeEnvironmentIds'
  | 'restoredRuntimeHostIdByWorkspaceSessionKey'
  | 'sshConnectionStates'
  | 'sshStateByEnvironment'
>

const OWNER_SLICE_KEYS: readonly (keyof OwnerSlices)[] = [
  'settings',
  'repos',
  'worktreesByRepo',
  'detectedWorktreesByRepo',
  'folderWorkspaces',
  'projectGroups',
  'runtimeEnvironments',
  'runtimeEnvironmentCatalogHydrated',
  'removedRuntimeEnvironmentIds',
  'restoredRuntimeHostIdByWorkspaceSessionKey',
  'sshConnectionStates',
  'sshStateByEnvironment'
]

/**
 * Memoized on the same ownership-causal slices as `createTabEntryAllowAbsolutePathsSelector`, so
 * unrelated store writes never re-run owner resolution while the omnibox is open.
 */
export function createTabEntryAbsolutePathHostPolicySelector(
  worktreeId: string,
  { skip = false }: { skip?: boolean } = {}
): (state: AppState) => TabEntryAbsolutePathHostPolicy {
  let previousSlices: unknown[] | null = null
  let previousResult: TabEntryAbsolutePathHostPolicy = BLOCKED_SKIPPED
  return (state) => {
    if (skip) {
      return BLOCKED_SKIPPED
    }
    const slices = OWNER_SLICE_KEYS.map((key) => state[key])
    if (previousSlices && slices.every((slice, index) => slice === previousSlices?.[index])) {
      return previousResult
    }
    previousSlices = slices
    previousResult = resolveTabEntryAbsolutePathHostPolicy(state, worktreeId)
    return previousResult
  }
}
