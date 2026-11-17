import { withWorkspaceRoute } from '../../../../src/navigation/workspace-route'
import { MobileSessionRouteScreen } from '../../../../src/session/MobileSessionRouteScreen'

import { LocalTaskSessionCardProvider } from '../../../../src/local-tasks/local-task-session-card-provider'

// Render screen directly: native sibling imports a shell module that throws in browsers, and manifest imports every route.
export default withWorkspaceRoute(function MobileSessionScreen() {
  return (
    <LocalTaskSessionCardProvider>
      <MobileSessionRouteScreen />
    </LocalTaskSessionCardProvider>
  )
})
