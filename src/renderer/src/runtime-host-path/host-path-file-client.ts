import { z } from 'zod'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

/**
 * Reading and writing a host file the client named by absolute path.
 *
 * The paired host answers `files.read`/`files.write` only for worktree-relative paths. Anything
 * outside the worktree goes through a grant instead: the client asks `files.grantHostPath` for one,
 * then reads and writes through the same `files.*TerminalArtifact` methods the mobile client has
 * always used. Nothing here is new wire surface.
 *
 * Grants expire (`terminal_file_grant_expired`) and are bound to the requesting client, so every
 * call site has to be able to ask for a fresh one — that is what `withFreshHostPathGrant` is for.
 */

export type RuntimeHostPathGrant = {
  grantId: string
  absolutePath: string
}

/** Typed host errors. Matching the exact string keeps an unrelated failure from spoofing a retry. */
const GRANT_EXPIRED = 'terminal_file_grant_expired'
const GRANT_MISMATCH = 'terminal_file_grant_mismatch'

export const HOST_PATH_UNAVAILABLE_MESSAGE =
  'The host could not open that path. Update the Orca server if it is older than this client.'

/**
 * Why `unknown` and not a generic: this is a wire boundary. A generic would let each call site
 * declare the shape it hoped for, so a host that answered something else would fail later and
 * somewhere else. The readers below check what actually arrived.
 */
export type RuntimeHostPathRpc = (
  method: string,
  params: Record<string, unknown>
) => Promise<unknown>

/**
 * What this client accepts back from the host.
 *
 * Why parsed and not read field by field: the answers cross a version boundary, so the shape is
 * input rather than a promise. Naming it here means a host that answers something else fails at the
 * boundary with a message about the boundary.
 */
const HostPathGrantResolution = z.object({
  exists: z.boolean(),
  openTarget: z.object({ grantId: z.string().min(1), absolutePath: z.string().min(1) }).optional()
})

const HostPathFileContent = z.object({
  content: z.string(),
  truncated: z.boolean().optional(),
  byteLength: z.number().optional()
})

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether the host refused because the grant is gone — the one failure a retry can fix. */
export function isExpiredHostPathGrantError(error: unknown): boolean {
  const text = errorText(error)
  return text.includes(GRANT_EXPIRED) || text.includes(GRANT_MISMATCH)
}

export async function requestHostPathGrant(
  call: RuntimeHostPathRpc,
  worktree: string,
  absolutePath: string
): Promise<RuntimeHostPathGrant> {
  const resolution = HostPathGrantResolution.safeParse(
    await call('files.grantHostPath', { worktree, absolutePath })
  )
  const openTarget =
    resolution.success && resolution.data.exists ? resolution.data.openTarget : null
  if (!openTarget) {
    // Why not the host's own words: `exists: false` is how it says "no", and it carries no message.
    throw new Error(`File not found on the host: ${absolutePath}`)
  }
  return { grantId: openTarget.grantId, absolutePath: openTarget.absolutePath }
}

export async function readHostPathFile(
  call: RuntimeHostPathRpc,
  worktree: string,
  grant: RuntimeHostPathGrant
): Promise<{ content: string; isBinary: false }> {
  const result = HostPathFileContent.safeParse(
    await call('files.readTerminalArtifact', {
      worktree,
      grantId: grant.grantId,
      absolutePath: grant.absolutePath
    })
  )
  if (!result.success) {
    throw new Error(HOST_PATH_UNAVAILABLE_MESSAGE)
  }
  if (result.data.truncated) {
    // Why refused and not completed: files.readChunk addresses a worktree-relative path, so a
    // granted path has no chunked form. Returning the prefix would make the next save drop the
    // rest of the file — the exact damage the worktree-relative read path refuses for.
    throw new Error(
      `Host file is too large to open in the editor (${result.data.byteLength ?? 0} bytes)`
    )
  }
  return { content: result.data.content, isBinary: false }
}

export async function writeHostPathFile(
  call: RuntimeHostPathRpc,
  worktree: string,
  grant: RuntimeHostPathGrant,
  content: string
): Promise<void> {
  await call('files.writeTerminalArtifact', {
    worktree,
    grantId: grant.grantId,
    absolutePath: grant.absolutePath,
    content
  })
}

/**
 * Run an operation against a grant, asking for a replacement once if the host says it is gone.
 *
 * Why exactly once: a second expiry inside one operation means the grant is not being refused for
 * age, and retrying forever would turn a permission problem into a spin.
 */
export async function withFreshHostPathGrant<T>(
  grant: RuntimeHostPathGrant,
  run: (current: RuntimeHostPathGrant) => Promise<T>,
  regrant: () => Promise<RuntimeHostPathGrant>
): Promise<{ result: T; grant: RuntimeHostPathGrant }> {
  try {
    return { result: await run(grant), grant }
  } catch (error) {
    if (!isExpiredHostPathGrantError(error)) {
      throw error
    }
    const replacement = await regrant()
    return { result: await run(replacement), grant: replacement }
  }
}

/**
 * The grant request bound to the live runtime target the context names.
 *
 * Why it lives here and not at the call site: the tab-entry action is at its line budget, and this
 * is feature code — it belongs with the rest of the grant handling.
 */
export async function requestHostPathGrantForContext(
  context: {
    settings?: Parameters<typeof getActiveRuntimeTarget>[0]
    worktreeId?: string | null
  },
  absolutePath: string
): Promise<RuntimeHostPathGrant> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind !== 'environment' || !context.worktreeId) {
    // Why this wording: "no runtime here" and "that path is not reachable" are the same thing from
    // where the reader sits.
    throw new Error(`File not found: ${absolutePath}`)
  }
  return requestHostPathGrant(
    (method, params) => callRuntimeRpc(target, method, params, { timeoutMs: 15_000 }),
    toRuntimeWorktreeSelector(context.worktreeId),
    absolutePath
  )
}
