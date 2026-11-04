import type { PluginHostRendererActions } from '../plugins/view/plugin-host-renderer-actions'
import {
  projectPluginWorkspaceContext,
  type PluginWorkspaceContext
} from '../plugins/workers/plugin-workspace-projection'

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
