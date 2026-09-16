import { isRuntimePathAbsolute } from '../../shared/cross-platform-path'

/**
 * What a paired client may ask this host to open by absolute path.
 *
 * The host's other absolute-file grants require *provenance*: the path was printed by one of this
 * terminal's own commands, or produced by a native-chat turn, and the terminal-artifact route
 * additionally confines it to the temp roots. This grant has none of that — a paired client can
 * name any path on the machine. That is a deliberate widening of what the runtime exposes, taken
 * by the fork owner on 2026-09-15 (D-301); it is the whole reason this policy sits in one named
 * file rather than inline at the call site.
 *
 * What is still enforced, and why each one survives the widening:
 *
 * - the path must be absolute — a relative path would resolve against whichever cwd the host
 *   happened to have, which is not a thing the client can reason about;
 * - the target must exist and be a regular file — a directory grant would let one id stand for an
 *   unbounded set of paths;
 * - the file must not be hard-linked (`assertTerminalArtifactNotHardLinked`, enforced by the grant
 *   store itself) — a second link is a second name for the same inode, so revoking the grant would
 *   not revoke the access;
 * - the grant still expires and is still bound to the requesting client, exactly as the
 *   provenance-backed grants are.
 */
export const HOST_PATH_GRANT_PROVENANCE = 'host-path'

export const HOST_PATH_GRANT_REQUIRES_ABSOLUTE_MESSAGE = 'A host path grant needs an absolute path.'

export const HOST_PATH_GRANT_DIRECTORY_MESSAGE = 'A host path grant cannot name a directory.'

/** The path this host will mint a grant for, or `null` when the request is not addressable. */
export function hostGrantPathCandidate(absolutePath: unknown): string | null {
  if (typeof absolutePath !== 'string') {
    return null
  }
  const trimmed = absolutePath.trim()
  if (!trimmed || !isRuntimePathAbsolute(trimmed)) {
    return null
  }
  // Why: a control character cannot appear in a path a user meant to type, but can appear in one
  // that was assembled from terminal output or an agent reply.
  if (Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return null
  }
  return trimmed
}
