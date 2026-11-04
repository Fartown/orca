import { z } from 'zod'
import { stripCredentialsFromMessage } from '../git-remote-error'
import type { GitRemoteIdentity } from '../git-remote-identity'
import type { Repo } from '../repo-types'
import { getRepoIdFromWorktreeId } from '../worktree/id'

export const PLUGIN_WORKSPACE_REMOTE_NAME_MAX_LENGTH = 256
export const PLUGIN_WORKSPACE_REMOTE_URL_MAX_LENGTH = 2048

/**
 * The Git remote Orca recorded for a workspace's repository, read on the host that owns it, so a
 * plugin can tell which hosted repository an SSH or WSL workspace belongs to without reaching it.
 */
export const pluginWorkspaceRemoteSchema = z
  .object({
    /** The remote's name, such as `origin`. */
    name: z.string().min(1).max(PLUGIN_WORKSPACE_REMOTE_NAME_MAX_LENGTH),
    /** Its URL with any user name and password removed; `git@host:path` keeps its `git@`. */
    url: z.string().min(1).max(PLUGIN_WORKSPACE_REMOTE_URL_MAX_LENGTH)
  })
  .strict()

export type PluginWorkspaceRemote = z.output<typeof pluginWorkspaceRemoteSchema>

type RecordedRemote = Pick<GitRemoteIdentity, 'remoteName' | 'remoteUrl'>
type RemoteRepo = Pick<Repo, 'id'> & { gitRemoteIdentity?: RecordedRemote | null }

/** Where the plugin host reads recorded remotes; absent on hosts that keep no repository list. */
export type PluginWorkspaceRemoteSource = {
  listVisibleRepos?(): readonly RemoteRepo[]
}

export function projectPluginWorkspaceRemote(
  identity: RecordedRemote | null | undefined
): PluginWorkspaceRemote | undefined {
  const name = identity?.remoteName.trim() ?? ''
  const url = identity ? stripCredentialsFromMessage(identity.remoteUrl.trim()) : ''
  if (
    !name ||
    !url ||
    name.length > PLUGIN_WORKSPACE_REMOTE_NAME_MAX_LENGTH ||
    url.length > PLUGIN_WORKSPACE_REMOTE_URL_MAX_LENGTH
  ) {
    return undefined
  }
  return { name, url }
}

export function pluginWorkspaceRemoteForRepo(
  repos: readonly RemoteRepo[],
  repoId: string
): PluginWorkspaceRemote | undefined {
  return projectPluginWorkspaceRemote(repos.find((repo) => repo.id === repoId)?.gitRemoteIdentity)
}

export function pluginWorkspaceRemoteForWorktree(
  repos: readonly RemoteRepo[],
  worktreeId: string
): PluginWorkspaceRemote | undefined {
  return pluginWorkspaceRemoteForRepo(repos, getRepoIdFromWorktreeId(worktreeId))
}

/** Adds the focused workspace's remote to a context, leaving it out when none is recorded. */
export function withPluginWorkspaceRemote<C extends { worktreeId: string }>(
  context: C | null,
  repos: readonly RemoteRepo[]
): (C & { remote?: PluginWorkspaceRemote }) | null {
  if (!context) {
    return null
  }
  const remote = pluginWorkspaceRemoteForWorktree(repos, context.worktreeId)
  return remote ? { ...context, remote } : context
}

const FOCUSED_ID_MAX_LENGTH = 4096
const FOCUSED_LABEL_MAX_LENGTH = 1024

/** The window's focused worktree, which main asks for when its own runtime does not own it. */
export const pluginFocusedWorkspaceSchema = z
  .object({
    worktreeId: z.string().min(1).max(FOCUSED_ID_MAX_LENGTH),
    branch: z.string().max(FOCUSED_LABEL_MAX_LENGTH),
    displayName: z.string().max(FOCUSED_LABEL_MAX_LENGTH),
    remote: pluginWorkspaceRemoteSchema.optional()
  })
  .strict()

export type PluginFocusedWorkspace = z.output<typeof pluginFocusedWorkspaceSchema>

type FocusedWorktree = { id: string; repoId: string; branch: string; displayName: string }

/** The focused worktree record and its repository's remote, without credentials; null when the
 *  window focuses no Git worktree. */
export function projectPluginFocusedWorkspace(
  worktree: FocusedWorktree | undefined,
  repos: readonly RemoteRepo[]
): PluginFocusedWorkspace | null {
  if (!worktree || !worktree.id || worktree.id.length > FOCUSED_ID_MAX_LENGTH) {
    return null
  }
  const remote = pluginWorkspaceRemoteForRepo(repos, worktree.repoId)
  return {
    worktreeId: worktree.id,
    branch: worktree.branch.slice(0, FOCUSED_LABEL_MAX_LENGTH),
    displayName: worktree.displayName.slice(0, FOCUSED_LABEL_MAX_LENGTH),
    ...(remote ? { remote } : {})
  }
}
