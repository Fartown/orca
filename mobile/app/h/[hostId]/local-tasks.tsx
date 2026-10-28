import { useLocalSearchParams } from 'expo-router'
import { MobileWebShellScreen } from '../../../src/mobile-web-shell/MobileWebShellScreen'
import {
  shellScreenRoute,
  shellScreenRouteKey
} from '../../../src/mobile-web-shell/shell-screen-route'
import { PageRouteUnavailableScreen } from '../../../src/mobile-web-shell/PageRouteUnavailableScreen'
import { firstParam } from '../../../src/navigation/route-param-reader'
import { localTasksRouteParams } from '../../../src/local-tasks/local-tasks-route'

/** The shell route for the local task library, in `accounts.tsx`'s shape. */
export default function MobileLocalTasksRoute() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    view?: string | string[]
    taskId?: string | string[]
    executionHost?: string | string[]
  }>()
  const hostId = firstParam(params.hostId)
  const focus = localTasksRouteParams({
    view: firstParam(params.view),
    taskId: firstParam(params.taskId),
    executionHost: firstParam(params.executionHost)
  })

  const route = hostId
    ? shellScreenRoute({
        pathname: `/h/${encodeURIComponent(hostId)}/local-tasks`,
        ...(focus ? { params: focus } : {})
      })
    : null
  if (route === null) {
    return <PageRouteUnavailableScreen hostId={hostId} />
  }
  // Keyed on the route: a session keeps the grants and route it opened with, so either is a remount.
  return <MobileWebShellScreen key={shellScreenRouteKey(route)} hostId={hostId} route={route} />
}
