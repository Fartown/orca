import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { agentHookServer } from '../agent-hooks/server'
import { getCanonicalUserDataPath } from '../persistence'
import { mainProcessState as state } from '../startup/main-process-state'
import type { IssueFeatureBootstrap } from './issue-feature-bootstrap'
import { startIssueFeatureForHost } from './issue-host-lifecycle'

let issueFeatureBootstrap: IssueFeatureBootstrap | null = null

export async function startIssueFeatureForMainProcess(): Promise<void> {
  const runtime = state.runtime
  const store = state.store
  const profile = state.activeOrcaProfile
  if (!runtime || !store || !profile) {
    throw new Error('Issue feature dependencies must be initialized before runtime launch')
  }
  const issueFeatureReady = state.localPtyStartupReady.then(async () => {
    const hooksEnabled = isAgentStatusHooksEnabled(store.getSettings())
    const hookEvidenceStatus = !hooksEnabled
      ? 'disabled'
      : Object.keys(agentHookServer.buildPtyEnv()).length > 0
        ? 'ready'
        : 'failed'
    issueFeatureBootstrap = await startIssueFeatureForHost({
      profileId: profile.profile.id,
      profileLabel: profile.profile.name,
      userDataPath: getCanonicalUserDataPath(),
      runtime,
      store,
      hookSource: agentHookServer,
      hookEvidenceStatus
    })
  })
  if (state.serveOptions) {
    await issueFeatureReady
  } else {
    void issueFeatureReady
  }
}

export function stopIssueFeatureForMainProcess(): void {
  issueFeatureBootstrap?.dispose()
  issueFeatureBootstrap = null
}
