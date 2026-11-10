import { translate } from '@/i18n/i18n'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { AppState } from '@/store/types'
import {
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { getHostSettingOverride } from '../../../shared/host-setting-overrides'

/**
 * A host's name in task views: the user's rename first, "This machine" for this one, else the
 * app's own label. Display only; snapshots saved with a link keep the app's label.
 */
export function selectLocalTaskHostLabel(
  state: AppState,
  hostId: ExecutionHostId | string
): string {
  const id = normalizeExecutionHostId(hostId)
  if (!id) {
    return hostId
  }
  if (
    parseExecutionHostId(id)?.kind === 'local' &&
    !getHostSettingOverride(state.settings, id, 'displayLabel')
  ) {
    return translate('localTasks.host.thisMachine', 'This machine')
  }
  return selectExecutionHostDisplayLabel(state, id)
}
