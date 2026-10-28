import { parseExecutionHostId } from '../../../src/shared/execution-host'
import {
  buildMobileNewTabAgentOptions,
  type MobileNewTabAgentOption,
  type MobileNewTabAgentSettings
} from '../session/mobile-new-tab-agent-options'
import {
  hostRefusesOtherRuntimeWorkspace,
  loadMobileNewTabAgentOptions
} from '../session/mobile-new-tab-agent-loader'
import {
  localAgentDetectionRead,
  remoteAgentDetectionRead
} from '../tasks/mobile-workspace-source-operations'
import { isMobileTuiAgent } from '../tasks/mobile-tui-agents'
import { newTabSettingsRead } from '../transport/settings-read-operations'
import type { RpcClient } from '../transport/rpc-client'

function readAgentSettings(settings: unknown): MobileNewTabAgentSettings | null {
  if (!settings || typeof settings !== 'object') {
    return null
  }
  return {
    defaultTuiAgent:
      'defaultTuiAgent' in settings && typeof settings.defaultTuiAgent === 'string'
        ? normalizeDefault(settings.defaultTuiAgent)
        : null,
    disabledTuiAgents: 'disabledTuiAgents' in settings ? settings.disabledTuiAgents : undefined
  }
}

function normalizeDefault(value: string): MobileNewTabAgentSettings['defaultTuiAgent'] {
  return value === 'blank' ? 'blank' : isMobileTuiAgent(value) ? value : null
}

/**
 * The agents a launch can pick, the user's default first, as the "+" new-tab sheet lists them. An
 * existing workspace asks its own host; Start asks the host the new workspace goes on.
 */
export async function loadLocalTaskAgentOptions(args: {
  client: RpcClient
  launchClient: RpcClient
  hostCapabilities: readonly string[]
  target: { kind: 'existing'; routeId: string } | { kind: 'create'; hostId: string }
}): Promise<MobileNewTabAgentOption[]> {
  if (args.target.kind === 'existing') {
    return loadMobileNewTabAgentOptions({
      client: args.launchClient,
      worktreeId: args.target.routeId,
      hostRefusesOtherRuntime: hostRefusesOtherRuntimeWorkspace(args.hostCapabilities)
    })
  }
  const host = parseExecutionHostId(args.target.hostId)
  const [settingsReply, detected] = await Promise.all([
    newTabSettingsRead.request(args.client),
    host?.kind === 'ssh'
      ? remoteAgentDetectionRead
          .request(args.client, { connectionId: host.targetId })
          .then((reply) => remoteAgentDetectionRead.interpret(reply))
      : localAgentDetectionRead
          .request(args.launchClient)
          .then((reply) => localAgentDetectionRead.interpret(reply))
  ])
  const settings = readAgentSettings(newTabSettingsRead.interpret(settingsReply)())
  return buildMobileNewTabAgentOptions(settings, detected.accepted ? detected.value : [])
}
