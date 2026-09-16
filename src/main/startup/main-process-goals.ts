import { app } from 'electron'
import { resolveGoalDriverEntry } from '../goals/goal-driver-launch'
import { registerRuntimeGoals } from '../goals/goal-runtime-registration'
import { getCanonicalUserDataPath } from '../persistence'
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
    unregister?.()
    unregister = registerRuntimeGoals({
      runtime,
      store,
      entryPath,
      userDataPath: getCanonicalUserDataPath()
    })
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
