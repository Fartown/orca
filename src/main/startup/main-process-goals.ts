import { app } from 'electron'
import { homedir } from 'node:os'
import { resolveGoalHome } from '../../shared/goals/goal-store-layout'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { agentHookServer } from '../agent-hooks/server'
import { GoalControlService } from '../goals/goal-control-service'
import { createGoalDriverLauncher, resolveGoalDriverEntry } from '../goals/goal-driver-launch'
import { GoalStore } from '../goals/goal-store'
import { getCanonicalUserDataPath } from '../persistence'
import { goalFeatureReadinessRegistry } from '../runtime/rpc/methods/goals'
import { mainProcessState as state } from './main-process-state'

let unregister: (() => void) | null = null

/** Same lifecycle shape as the Issues feature: composed after the local PTY startup, torn down on quit. */
export async function startGoalFeatureForMainProcess(): Promise<void> {
  const runtime = state.runtime
  const store = state.store
  if (!runtime || !store) {
    throw new Error('Goal feature dependencies must be initialized before runtime launch')
  }
  const ready = state.localPtyStartupReady.then(() => {
    const entryPath = resolveGoalDriverEntry({
      env: process.env,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath()
    })
    const hooksEnabled = isAgentStatusHooksEnabled(store.getSettings())
    const hookEvidence = !hooksEnabled
      ? 'disabled'
      : Object.keys(agentHookServer.buildPtyEnv()).length > 0
        ? 'ready'
        : 'failed'
    const service = new GoalControlService({
      store: new GoalStore(resolveGoalHome(process.env, homedir())),
      terminals: runtime,
      hooks: agentHookServer,
      launcher: createGoalDriverLauncher({ entryPath }),
      // Why: the driver's RuntimeClient reads runtime metadata from the same canonical path the RPC server writes it to.
      userDataPath: getCanonicalUserDataPath()
    })
    unregister?.()
    const unregisterService = goalFeatureReadinessRegistry.register(service, {
      driverEntry: entryPath ? 'ready' : 'missing',
      hookEvidence
    })
    unregister = () => {
      service.drafts.dispose()
      unregisterService()
    }
    if (!entryPath) {
      console.warn('[goals] driver bundle missing; run `pnpm build:goal-driver` to enable goals')
    }
  })
  if (state.serveOptions) {
    await ready
  } else {
    void ready
  }
}

export function stopGoalFeatureForMainProcess(): void {
  unregister?.()
  unregister = null
}
