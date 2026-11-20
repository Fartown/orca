import type { TuiAgent } from '../../../src/shared/agent-launch/catalog/tui-agent'
import { randomV4Uuid } from '../platform/random-v4-uuid'
import {
  reserveMobileAgentLaunch,
  type MobileAgentLaunchReservation
} from '../session/agent-launch/mobile-agent-launch-reservation'

export type LaunchReservation = MobileAgentLaunchReservation

/** The pane and session ids a task launch reserves, spelled as the launching host accepts them. */
export function reserveLaunch(
  agent: TuiAgent,
  hostCapabilities: readonly string[]
): LaunchReservation {
  return reserveMobileAgentLaunch(agent, hostCapabilities, randomV4Uuid)
}
