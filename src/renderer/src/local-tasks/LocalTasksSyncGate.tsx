import { useEffect } from 'react'
import { isWebClientLocation } from '@/lib/web-client-location'
import { subscribeRuntimeRpc } from '../runtime/runtime-rpc-subscribe'
import { localTasksDomainStore, useLocalTasksDomain } from './local-tasks-domain-store'
import { localTasksSync } from './local-tasks-sync'
import { installLocalTaskPageKeyRouter } from './local-task-page-keys'
import { bindLocalTaskSourceActivation } from './local-task-source-activation'
import { bindLocalTaskViewPreferences } from './local-task-view-preferences'

/**
 * Holds this desktop's task-library change stream. Reads follow the host's notices only; a closed
 * stream stays closed until the user retries, because the library lives in this same app.
 */
export function LocalTasksSyncGate(): null {
  const epoch = useLocalTasksDomain((state) => state.subscriptionEpoch)

  useEffect(() => installLocalTaskPageKeyRouter(), [])
  useEffect(() => bindLocalTaskSourceActivation(), [])
  useEffect(() => bindLocalTaskViewPreferences(), [])

  useEffect(() => {
    // Why: a browser client reaches a paired host, not the desktop that owns this library.
    if (isWebClientLocation()) {
      return
    }
    let disposed = false
    let handle: { unsubscribe: () => void } | null = null
    localTasksDomainStore.getState().setConnection('connecting')
    void subscribeRuntimeRpc({ kind: 'local' }, 'localTasks.subscribeChanges', null, {
      onEvent: (frame) => {
        if (!disposed) {
          localTasksSync.receive(frame)
        }
      },
      onError: (error) => {
        if (!disposed) {
          localTasksSync.fail(error)
        }
      },
      onClose: () => {
        if (!disposed) {
          localTasksDomainStore.getState().setConnection('ended')
        }
      }
    }).then(
      (opened) => {
        if (disposed) {
          opened.unsubscribe()
        } else {
          handle = opened
        }
      },
      (error: unknown) => {
        if (!disposed) {
          localTasksSync.fail(error)
        }
      }
    )
    return () => {
      disposed = true
      handle?.unsubscribe()
    }
  }, [epoch])

  return null
}
