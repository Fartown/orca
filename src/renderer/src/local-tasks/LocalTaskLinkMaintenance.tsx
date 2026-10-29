import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { getReachableRuntimeEnvironmentIds } from '../hooks/ipc-events/runtime-environment-subscription-selection'
import { localTasksClient } from './local-tasks-runtime-client'
import { isLocalTasksWritable, localTasksDomainStore } from './local-tasks-domain-store'
import { bindLocalTaskStartWork } from './local-task-start-work'
import { bindLocalTaskSeenForwarding } from './local-task-seen-forwarding'
import { LocalTaskWorkspaceTaskPickerHost } from '@/components/local-tasks/LocalTaskWorkspaceTaskPicker'
import {
  findLocalTaskPrMergedTriggers,
  findLocalTaskWorkspaceFixes,
  selectLocalTaskReviewWorktreeIds
} from './local-task-link-maintenance'

function appInputs(state: AppState): readonly unknown[] {
  return [
    selectWorktreesByRepo(state),
    state.detectedWorktreesByRepo,
    state.folderWorkspaces,
    state.repos,
    state.sshConnectionStates,
    getReachableRuntimeEnvironmentIds(state).join('\n'),
    state.prCache,
    state.hostedReviewCache
  ]
}

function sameInputs(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Keeps workspace links current from what this window already knows (§7.1, §10): instance and
 * host of linked workspaces, and the PR-merged rule, each in the library that holds the link.
 * Each write is attempted once per value; a failure waits for the next change rather than a retry.
 */
export function LocalTaskLinkMaintenance(): React.JSX.Element {
  useEffect(() => bindLocalTaskStartWork(), [])
  // Why here: a session seen from the sidebar or a tab counts as seen in its library too.
  useEffect(() => bindLocalTaskSeenForwarding(), [])

  useEffect(() => {
    const attempted = new Set<string>()
    let reviewIdsKey = ''
    let previousInputs: readonly unknown[] = []
    let previousLibrary: unknown = null

    const once = (key: string, write: () => Promise<unknown>): void => {
      if (attempted.has(key)) {
        return
      }
      attempted.add(key)
      // Why clear on failure: a transient RPC error (brief disconnect, service not ready) must not
      // block the same fix forever; the next change re-attempts it. Idempotent receipts and the PR
      // trigger table keep a late success from applying twice.
      void write().catch((error: unknown) => {
        attempted.delete(key)
        console.error('local tasks: link upkeep failed', error)
      })
    }

    const run = (): void => {
      const domain = localTasksDomainStore.getState()
      const state = useAppStore.getState()
      const reviewIds: string[] = []
      for (const library of domain.partitions) {
        if (!library.linksLoaded) {
          continue
        }
        reviewIds.push(...selectLocalTaskReviewWorktreeIds(state, library))
        if (!isLocalTasksWritable(domain, library.endpoint)) {
          continue
        }
        for (const fix of findLocalTaskWorkspaceFixes(state, library.links)) {
          once(`workspace:${JSON.stringify(fix)}`, () =>
            localTasksClient.resolveWorkspace(fix.input, fix.repoId)
          )
        }
        // Why visible only: a hidden window refreshes nothing, so its caches are not fresh evidence.
        if (document.visibilityState !== 'visible') {
          continue
        }
        for (const trigger of findLocalTaskPrMergedTriggers(state, library)) {
          once(`rule:${JSON.stringify(trigger)}`, () => localTasksClient.applyPrMerged(trigger))
        }
      }
      const nextReviewIds = reviewIds.join('\n')
      if (nextReviewIds !== reviewIdsKey) {
        reviewIdsKey = nextReviewIds
        // Why: the refresh report only recomputes on its own store keys; links live outside them.
        state.bumpGitHubPRVisibleRefreshGeneration()
      }
    }

    const runIfChanged = (): void => {
      const inputs = appInputs(useAppStore.getState())
      const library = localTasksDomainStore.getState().partitions
      if (sameInputs(inputs, previousInputs) && library === previousLibrary) {
        return
      }
      previousInputs = inputs
      previousLibrary = library
      run()
    }

    const unsubscribeApp = useAppStore.subscribe(runIfChanged)
    const unsubscribeLibrary = localTasksDomainStore.subscribe(runIfChanged)
    document.addEventListener('visibilitychange', run)
    runIfChanged()
    return () => {
      unsubscribeApp()
      unsubscribeLibrary()
      document.removeEventListener('visibilitychange', run)
    }
  }, [])

  // Why here: a sidebar menu opens this picker after the menu itself has closed.
  return <LocalTaskWorkspaceTaskPickerHost />
}
