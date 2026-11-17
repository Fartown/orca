import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import { subscribeLocalTaskChanges } from './local-task-self-changes'
import { retainLocalTaskLibraryEndpoint } from './local-task-library-viewers'
import { localTaskDispatcherClientFor } from './local-task-dispatcher-client'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent,
  subscribeLocalTaskDispatcherSource,
  applyLocalTaskDispatcherPreferences
} from './local-task-dispatcher-source'

/** Follows the selected library's existing shared stream; no private polling or reconnect. */
export function subscribeLocalTaskDispatcherChanges(
  listener: (scopes: readonly LocalTaskChangeScope[] | null) => void,
  onSource: () => void = () => {},
  retain = false
): () => void {
  let stop = (): void => {}
  let release = (): void => {}
  let retained: string | null = null
  let disposed = false
  const bind = (): void => {
    stop()
    const endpoint = getLocalTaskDispatcherEndpoint()
    const epoch = getLocalTaskDispatcherEpoch()
    let latestPreferences = 0
    const onChange = (scopes: readonly LocalTaskChangeScope[] | null): void => {
      if (disposed || !isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
        return
      }
      if (retain && endpoint !== 'local' && (scopes === null || scopes.includes('preferences'))) {
        const sequence = ++latestPreferences
        void localTaskDispatcherClientFor(endpoint)
          .readPreferences()
          .then((preferences) => {
            if (
              !disposed &&
              sequence === latestPreferences &&
              isLocalTaskDispatcherSourceCurrent(endpoint, epoch)
            ) {
              applyLocalTaskDispatcherPreferences(endpoint, preferences)
              listener(scopes)
            }
          })
          .catch(() => {})
      }
      listener(scopes)
    }
    stop = subscribeLocalTaskChanges(endpoint, onChange)
    const wanted = retain && endpoint !== 'local' ? endpoint : null
    if (retained !== wanted) {
      release()
      retained = wanted
      release = wanted ? retainLocalTaskLibraryEndpoint(wanted) : () => {}
    }
    onSource()
    onChange(null)
  }
  const unsubscribe = subscribeLocalTaskDispatcherSource(bind)
  bind()
  return () => {
    disposed = true
    unsubscribe()
    stop()
    release()
  }
}
