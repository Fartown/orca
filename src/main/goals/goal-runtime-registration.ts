import { homedir } from 'node:os'
import { resolveGoalHome } from '../../shared/goals/goal-store-layout'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { agentHookServer } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { Store } from '../persistence'
import { goalFeatureReadinessRegistry } from '../runtime/rpc/methods/goals'
import { GoalControlService } from './goal-control-service'
import { resolveGoalDraftWorkspace } from './goal-draft-workspace'
import { createGoalDriverLauncher } from './goal-driver-launch'
import { GoalStore } from './goal-store'

export function registerRuntimeGoals(input: {
  runtime: OrcaRuntimeService
  store: Store
  entryPath: string | null
  userDataPath: string
}): () => void {
  const { runtime, store, entryPath, userDataPath } = input
  const service = new GoalControlService({
    store: new GoalStore(resolveGoalHome(process.env, homedir())),
    terminals: runtime,
    hooks: agentHookServer,
    resolveDraftWorkspace: (selector) =>
      resolveGoalDraftWorkspace(selector, {
        getFolderWorkspaces: () => store.getFolderWorkspaces(),
        getRepos: () => store.getRepos(),
        getProjectGroups: () => store.getProjectGroups(),
        showWorktree: (value) => runtime.showManagedWorktree(value)
      }),
    launcher: createGoalDriverLauncher({ entryPath }),
    userDataPath
  })
  const unregister = goalFeatureReadinessRegistry.register(service, {
    driverEntry: entryPath ? 'ready' : 'missing',
    hookEvidence: !isAgentStatusHooksEnabled(store.getSettings())
      ? 'disabled'
      : Object.keys(agentHookServer.buildPtyEnv()).length > 0
        ? 'ready'
        : 'failed'
  })
  service.recovery.start()
  return () => {
    service.recovery.stop()
    service.drafts.dispose()
    unregister()
  }
}
