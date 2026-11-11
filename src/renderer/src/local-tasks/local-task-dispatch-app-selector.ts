import type { AppState } from '@/store/types'
import {
  selectDetectedWorktreesByRepo,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'

export function createDispatchAppSelector(): (state: AppState) => AppState {
  let previous: { fields: readonly unknown[]; state: AppState } | null = null
  return (state) => {
    const fields = [
      state.repos,
      state.projects,
      state.projectHostSetups,
      selectWorktreesByRepo(state),
      selectFolderWorkspaces(state),
      selectDetectedWorktreesByRepo(state),
      state.projectGroups,
      state.restoredRuntimeHostIdByWorkspaceSessionKey,
      state.activeWorktreeId,
      state.activeWorkspaceExecutionHostId,
      state.runtimeEnvironments,
      state.runtimeEnvironmentCatalogHydrated,
      state.removedRuntimeEnvironmentIds,
      state.runtimeStatusByEnvironmentId,
      state.sshConnectionStates,
      state.sshStateByEnvironment,
      state.sshTargetLabels,
      state.removedSshTargetLabels,
      state.wslHostStatuses,
      state.wslHostServerFiles,
      state.settings
    ]
    const snapshot = previous
    if (snapshot && fields.every((field, index) => Object.is(field, snapshot.fields[index]))) {
      return snapshot.state
    }
    previous = { fields, state }
    return state
  }
}
