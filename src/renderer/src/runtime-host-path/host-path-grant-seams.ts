/**
 * One-call entry points for the upstream files this feature has to touch.
 *
 * Why they exist: each upstream seam should be a single line, so an upstream refactor of the
 * surrounding function conflicts on one line instead of carrying a block of fork logic away with
 * it. The logic itself lives here, where `check:fork-features` can also pin it by name.
 */
import { callRuntimeFileMutation } from '@/runtime/runtime-file-mutation-rpc'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type {
  RuntimeFileOperationArgs,
  RuntimeHostPathGrantRef,
  RuntimeReadableFileContent
} from '@/runtime/runtime-file-client-types'
import { readHostPathFile, writeHostPathFile } from './host-path-file-client'

function environmentTarget(
  settings: RuntimeFileOperationArgs['settings'],
  worktreeId?: string | null
) {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' && worktreeId
    ? { target, worktree: toRuntimeWorktreeSelector(worktreeId) }
    : null
}

/** Read a granted host path, or `null` when this read is not one. */
export async function readHostPathFileForTab(
  settings: RuntimeFileOperationArgs['settings'],
  worktreeId: string | null | undefined,
  grant: RuntimeHostPathGrantRef | undefined
): Promise<RuntimeReadableFileContent | null> {
  const addressed = grant ? environmentTarget(settings, worktreeId) : null
  if (!grant || !addressed) {
    return null
  }
  return readHostPathFile(
    (method, params) => callRuntimeRpc(addressed.target, method, params, { timeoutMs: 15_000 }),
    addressed.worktree,
    grant
  )
}

/** Write a granted host path. Returns false when this write is not one, so the caller falls through. */
export async function writeHostPathFileForTab(
  context: RuntimeFileOperationArgs,
  filePath: string,
  content: string
): Promise<boolean> {
  const grant = context.hostPathGrant
  // Why the path must match: a grant names one file, and reusing it for another would write
  // through an authorization that was never asked for.
  const addressed =
    grant && grant.absolutePath === filePath
      ? environmentTarget(context.settings, context.worktreeId)
      : null
  if (!grant || !addressed) {
    return false
  }
  await writeHostPathFile(
    (method, params) => callRuntimeFileMutation(addressed.target, method, params, 15_000),
    addressed.worktree,
    grant,
    content
  )
  return true
}

export type AbsoluteTabEntryReach = {
  /** The path the host will actually serve — canonical when a grant was minted. */
  openedPath: string
  grant?: RuntimeHostPathGrantRef
}

/**
 * How the tab entry can reach `filePath`, proven to exist.
 *
 * A paired host addresses `files.*` by worktree-relative path, so a path outside the worktree has
 * no form that RPC can carry and needs a grant instead. The grant request doubles as the existence
 * check — the host refuses a missing path and a directory itself — which is why there is no stat
 * on that branch.
 */
export async function resolveAbsoluteTabEntryReach(args: {
  context: RuntimeFileOperationArgs
  filePath: string
  worktreeRelativePath: string | null
  requestHostPathGrant: (
    context: RuntimeFileOperationArgs,
    absolutePath: string
  ) => Promise<RuntimeHostPathGrantRef>
  statRuntimePath: (
    context: RuntimeFileOperationArgs,
    filePath: string
  ) => Promise<{ isDirectory: boolean }>
}): Promise<AbsoluteTabEntryReach> {
  const needsGrant =
    Boolean(args.context.settings?.activeRuntimeEnvironmentId?.trim()) && !args.worktreeRelativePath
  if (needsGrant) {
    const grant = await args.requestHostPathGrant(args.context, args.filePath)
    // Why the grant's path wins: the host canonicalizes before minting, so this is the file it
    // will read and write. Keeping the typed alias would leave every later save unable to match.
    return { openedPath: grant.absolutePath, grant }
  }
  let stat: { isDirectory: boolean }
  try {
    stat = await args.statRuntimePath(args.context, args.filePath)
  } catch {
    throw new Error(`File not found: ${args.filePath}`)
  }
  if (stat.isDirectory) {
    throw new Error(`Cannot open a directory: ${args.filePath}`)
  }
  return { openedPath: args.filePath }
}
