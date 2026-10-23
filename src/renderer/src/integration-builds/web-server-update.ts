import type { UpdateCheckOptions } from '../../../shared/update-status-types'
import { webRuntimeState } from '../web/preload-api/web-runtime-session'

export function webServerVersion(): string {
  const snapshot = webRuntimeState.activeClient?.statusOwner?.read()
  return snapshot?.verification === 'verified' &&
    snapshot.transport === 'ready' &&
    !snapshot.retired
    ? snapshot.status?.appVersion?.trim() || 'web'
    : 'web'
}

export async function openWebServerUpdate(options: UpdateCheckOptions = {}): Promise<void> {
  const { useAppStore } = await import('../store')
  const state = useAppStore.getState()
  state.setRemoteServerUpdateDialogOpen(true)
  await state.refreshRemoteServerUpdates(options)
}
