import { startGoals } from '../goals/orcad-goals'
import { startOrcadArtifactShare } from '../self-hosted-artifacts/orcad-artifact-share'

type Runtime = Parameters<typeof startGoals>[0]
type Store = Parameters<typeof startGoals>[1] & Parameters<typeof startOrcadArtifactShare>[0]

// Register each cleanup immediately so a later startup failure also closes earlier services.
export async function startOrcadForkServices(
  runtime: Runtime,
  store: Store,
  registerCleanup: (stop: () => void | Promise<void>) => void
): Promise<void> {
  registerCleanup(startGoals(runtime, store))
  registerCleanup(startOrcadArtifactShare(store))
}
