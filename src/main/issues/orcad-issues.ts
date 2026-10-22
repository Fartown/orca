import { getAppEnvironment } from '../../shared/app-environment'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { agentHookServer } from '../agent-hooks/server'
import { ensureActiveOrcaProfile } from '../orca-profiles/profile-index-store'
import {
  startIssueFeatureForHost,
  type StartIssueFeatureForHostOptions
} from './issue-host-lifecycle'

type HookSettings = Parameters<typeof isAgentStatusHooksEnabled>[0]

export async function startOrcadIssues(
  runtime: StartIssueFeatureForHostOptions['runtime'],
  store: StartIssueFeatureForHostOptions['store'] & { getSettings(): HookSettings }
): Promise<() => void> {
  const userDataPath = getAppEnvironment().getPath('userData')
  const { profile } = ensureActiveOrcaProfile(userDataPath)
  const bootstrap = await startIssueFeatureForHost({
    profileId: profile.id,
    profileLabel: profile.name,
    userDataPath,
    runtime,
    store,
    hookSource: agentHookServer,
    hookEvidenceStatus: !isAgentStatusHooksEnabled(store.getSettings())
      ? 'disabled'
      : Object.keys(agentHookServer.buildPtyEnv()).length > 0
        ? 'ready'
        : 'failed'
  })
  return () => bootstrap?.dispose()
}
