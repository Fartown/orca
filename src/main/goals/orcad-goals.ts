import { getAppEnvironment } from '../../shared/app-environment'
import { resolveOrcadInstallRoot } from '../orcad/orcad-app-paths'
import { resolveGoalDriverEntry } from './goal-driver-launch'
import { registerRuntimeGoals } from './goal-runtime-registration'

type Registration = Parameters<typeof registerRuntimeGoals>[0]

export function startGoals(
  runtime: Registration['runtime'],
  store: Registration['store']
): () => void {
  return registerRuntimeGoals({
    runtime,
    store,
    userDataPath: getAppEnvironment().getPath('userData'),
    entryPath: resolveGoalDriverEntry({
      env: process.env,
      resourcesPath: undefined,
      appPath: resolveOrcadInstallRoot()
    })
  })
}
