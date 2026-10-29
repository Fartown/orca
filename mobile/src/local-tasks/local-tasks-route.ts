import type { HostStackRouteTarget } from '../navigation/host-stack-navigation'

/** The page route's pathname, for a caller already inside the host's stack. */
export function localTasksRoutePath(hostId: string): `/h/${string}` {
  return `/h/${encodeURIComponent(hostId)}/local-tasks`
}

/** Where the page opens: the "Needs you" view, or one task's detail. */
export type LocalTasksRouteFocus = { view: 'attention' } | { taskId: string }

/** A server's library behind the paired host (D-008); the paired host's own when absent. */
type LibraryParam = { executionHost?: `runtime:${string}` }

/** Host id stays raw: the navigator owns the params, so pre-encoding would arrive still escaped. */
export function localTasksRouteTarget(
  hostId: string,
  focus?: LocalTasksRouteFocus,
  library?: LibraryParam
): HostStackRouteTarget {
  return {
    name: '[hostId]/local-tasks',
    params: {
      hostId,
      ...focus,
      ...(library?.executionHost ? { executionHost: library.executionHost } : {})
    }
  }
}

/** The page's href for a caller already inside the host's stack. */
export function localTasksRouteHref(
  hostId: string,
  focus?: LocalTasksRouteFocus,
  library?: LibraryParam
): string {
  const query = new URLSearchParams(localTasksRouteParams({ ...focus, ...library }) ?? {})
  const search = query.toString()
  return search ? `${localTasksRoutePath(hostId)}?${search}` : localTasksRoutePath(hostId)
}

/** The page's own params, as the shell hands them to the document. */
export function localTasksRouteParams(params: {
  view?: string
  taskId?: string
  executionHost?: string
}): Record<string, string> | undefined {
  const focus: Record<string, string> = {}
  if (params.view === 'attention') {
    focus.view = 'attention'
  }
  if (params.taskId) {
    focus.taskId = params.taskId
  }
  if (params.executionHost?.startsWith('runtime:')) {
    focus.executionHost = params.executionHost
  }
  return Object.keys(focus).length > 0 ? focus : undefined
}
