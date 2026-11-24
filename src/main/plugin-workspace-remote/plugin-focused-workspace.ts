import type { PluginWorkspaceRemote } from '../../shared/plugin-workspace-remote/plugin-workspace-remote'
import type { PluginHostRendererActions } from '../plugins/view/plugin-host-renderer-actions'
import {
  projectPluginWorkspaceContext,
  type PluginWorkspaceContext
} from '../plugins/workers/host-api/plugin-workspace-projection'

/**
 * `readContext` and `workspace.changed` for a focused workspace main's runtime does not own (an
 * orcad-managed SSH host or a paired runtime): the window's record, without terminals, which run
 * on that host. No window, or no answer, leaves the context null as before.
 */
export async function readPluginFocusedWorkspaceElsewhere(
  renderer: Pick<PluginHostRendererActions, 'readFocusedWorkspace'> | null | undefined
): Promise<PluginWorkspaceContext> {
  const focused = (await renderer?.readFocusedWorkspace?.().catch(() => null)) ?? null
  return projectPluginWorkspaceContext(focused, [])
}

/**
 * A context main resolved from its stored rows for a workspace whose repository main's runtime
 * does not list (an orcad-managed SSH host): the window's record of the same worktree carries
 * the remote. Any other answer leaves the context as it was.
 */
export async function withPluginFocusedWorkspaceRemote<
  C extends { worktreeId: string; remote?: PluginWorkspaceRemote }
>(
  context: C,
  renderer: Pick<PluginHostRendererActions, 'readFocusedWorkspace'> | null | undefined
): Promise<C> {
  if (context.remote) {
    return context
  }
  const focused = (await renderer?.readFocusedWorkspace?.().catch(() => null)) ?? null
  return focused?.worktreeId === context.worktreeId && focused.remote
    ? { ...context, remote: focused.remote }
    : context
}

type ResolvedContext = NonNullable<Parameters<typeof projectPluginWorkspaceContext>[0]> & {
  worktreeId: string
  remote?: PluginWorkspaceRemote
}

/** `readContext`'s answer: main's context, its remote completed from the window, else the window's. */
export async function resolvePluginReadContext(
  context: ResolvedContext | null,
  terminals: Parameters<typeof projectPluginWorkspaceContext>[1],
  renderer: Pick<PluginHostRendererActions, 'readFocusedWorkspace'> | null | undefined
): Promise<PluginWorkspaceContext> {
  return context
    ? projectPluginWorkspaceContext(
        await withPluginFocusedWorkspaceRemote(context, renderer),
        terminals
      )
    : readPluginFocusedWorkspaceElsewhere(renderer)
}
