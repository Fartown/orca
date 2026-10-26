import type { HostStackRouteTarget } from '../navigation/host-stack-navigation'

/** The page route's pathname, for a caller already inside the host's stack. */
export function localTasksRoutePath(hostId: string): `/h/${string}` {
  return `/h/${encodeURIComponent(hostId)}/local-tasks`
}

/** Host id stays raw: the navigator owns the params, so pre-encoding would arrive still escaped. */
export function localTasksRouteTarget(hostId: string): HostStackRouteTarget {
  return { name: '[hostId]/local-tasks', params: { hostId } }
}
