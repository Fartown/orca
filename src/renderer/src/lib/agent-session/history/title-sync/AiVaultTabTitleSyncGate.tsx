import { useEffect } from 'react'
import {
  canonicalSessionTitleKey,
  getCanonicalSessionTitle,
  subscribeCanonicalSessionTitles
} from '@/lib/canonical-session-titles'
import { startAiVaultTabTitleSync } from '@/lib/agent-session/history/title-sync/ai-vault-tab-title-sync'
import { scheduleAfterInputQuiet } from '@/lib/window-activity/input-quiet-scheduler'
import { useAppStore } from '@/store/index'
import {
  readRuntimeStatuses,
  subscribeAppStoreWithStatuses
} from '@/store/slices/runtime-status/views/runtime-status-owner'
import { sessionNameStore } from '@/session-names/session-name-store'

const TITLE_SYNC_DELAY_MS = 1_000
const TITLE_SYNC_QUIET_MS = 1_500
const TITLE_SYNC_IDLE_TIMEOUT_MS = 3_000

export function AiVaultTabTitleSyncGate(): null {
  useEffect(
    () =>
      startAiVaultTabTitleSync({
        getState: useAppStore.getState,
        subscribe: subscribeAppStoreWithStatuses,
        readStatuses: readRuntimeStatuses,
        resolveSessionTitles: sessionNameStore.resolveSessionTitles,
        subscribeSessionNames: sessionNameStore.subscribe,
        getSessionName: (request) =>
          sessionNameStore
            .getSnapshot()
            .get(
              canonicalSessionTitleKey(
                request.executionHostId,
                request.agent,
                request.providerSession.id
              )
            ),
        invalidateSessionNames: (requests) =>
          sessionNameStore.invalidate(
            requests.map((request) => ({
              executionHostId: request.executionHostId,
              agent: request.agent,
              sessionId: request.providerSession.id
            }))
          ),
        getCanonicalTitle: (executionHostId, agent, sessionId) =>
          getCanonicalSessionTitle(executionHostId, agent, sessionId) ?? null,
        subscribeCanonicalTitles: subscribeCanonicalSessionTitles,
        scheduleReconcile: (callback) =>
          scheduleAfterInputQuiet(callback, {
            delayMs: TITLE_SYNC_DELAY_MS,
            quietMs: TITLE_SYNC_QUIET_MS,
            idleTimeoutMs: TITLE_SYNC_IDLE_TIMEOUT_MS
          })
      }),
    []
  )
  return null
}
