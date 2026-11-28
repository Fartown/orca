import { shouldPersistWorkspaceSession } from '@/lib/workspace/persistence/workspace-session'
import { windowAcknowledgedSessionEntries } from '@/lib/workspace/persistence/workspace-session-acknowledged-entries'
import { patchHostSlice } from '@/lib/workspace/persistence/workspace-session-host-entries-write'
import {
  buildHostIdByWorktreeId,
  type SessionApi
} from '@/lib/workspace/persistence/workspace-session-host-persistence'
import { replaceRecordEntries } from '@/store/record-transitions/keyed-record-transitions'
import type { AppState } from '@/store/types'

type SleepingRecords = AppState['sleepingAgentSessionsByPaneKey']

function selectSleepingRecordsForHost(
  state: AppState,
  targetHostId: ReturnType<ReturnType<typeof buildHostIdByWorktreeId>>,
  records: SleepingRecords
): SleepingRecords {
  const hostIdByWorktreeId = buildHostIdByWorktreeId(state)
  const scoped: SleepingRecords = {}
  for (const [paneKey, record] of Object.entries(records)) {
    if (hostIdByWorktreeId(record.worktreeId) === targetHostId) {
      scoped[paneKey] = record
    }
  }
  return scoped
}

/** Write one worktree owner's sleepingAgentSessionsByPaneKey partition directly so local, SSH, and folder-only hosts persist and roll back cleanly. */
async function writeHostSleepingAgentSessions(
  state: AppState,
  worktreeId: string,
  records: SleepingRecords
): Promise<boolean> {
  const session = typeof window === 'undefined' ? undefined : window.api?.session
  if (!session || !shouldPersistWorkspaceSession(state)) {
    return false
  }
  const targetHostId = buildHostIdByWorktreeId(state)(worktreeId)
  const hostRecords = selectSleepingRecordsForHost(state, targetHostId, records)
  let skipped = false
  const trackedSession: SessionApi = session.patchEntries
    ? {
        ...session,
        patchEntries: async (patch, hostId, relays) => {
          const result = await session.patchEntries!(patch, hostId, relays)
          if (result.status === 'skipped') {
            skipped = true
          }
          return result
        }
      }
    : session
  await patchHostSlice(
    trackedSession,
    { sleepingAgentSessionsByPaneKey: hostRecords },
    targetHostId,
    windowAcknowledgedSessionEntries
  )
  if (skipped) {
    throw new Error('sleeping_agent_session_write_skipped')
  }
  return true
}

function isHibernationPaneStillEligible(args: {
  state: AppState
  worktreeId: string
  paneKey: string
  tabId: string
  leafId: string
  ptyId: string
  expectedRuntimePtyIds: readonly string[]
  beforeInputAt: number
  beforeStatusState: string | undefined
}): boolean {
  const {
    state,
    worktreeId,
    paneKey,
    tabId,
    leafId,
    ptyId,
    expectedRuntimePtyIds,
    beforeInputAt,
    beforeStatusState
  } = args
  const tabExists = (state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId)
  if (!tabExists) {
    return false
  }
  if (state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[leafId] !== ptyId) {
    return false
  }
  if (expectedRuntimePtyIds.length === 0 && !(state.ptyIdsByTabId[tabId] ?? []).includes(ptyId)) {
    return false
  }
  if ((state.lastTerminalInputAtByPaneKey[paneKey] ?? 0) > beforeInputAt) {
    return false
  }
  if (beforeStatusState !== undefined) {
    const freshStatus = state.agentStatusByPaneKey.get(paneKey)
    if (!freshStatus || freshStatus.state !== beforeStatusState) {
      return false
    }
  }
  return true
}

export type PreparedHibernationSleepWrite = {
  rollbackMain: () => Promise<void>
}

/** Flush prospective worktree-sleep records to main BEFORE mutating suppressedPtyExitIds or killing the PTY, then re-verify pane eligibility after the await. */
export async function prepareHibernationSleepingSessionWrite(args: {
  get: () => AppState
  worktreeId: string
  paneKey: string
  tabId: string
  leafId: string
  ptyId: string
  expectedRuntimePtyIds: readonly string[]
  sleepingAgentSessionRecords: SleepingRecords
}): Promise<PreparedHibernationSleepWrite> {
  const {
    get,
    worktreeId,
    paneKey,
    tabId,
    leafId,
    ptyId,
    expectedRuntimePtyIds,
    sleepingAgentSessionRecords
  } = args
  const beforeState = get()
  const beforeInputAt = beforeState.lastTerminalInputAtByPaneKey[paneKey] ?? 0
  const beforeStatusState = beforeState.agentStatusByPaneKey.get(paneKey)?.state
  const prospectiveSleeping = replaceRecordEntries(
    beforeState.sleepingAgentSessionsByPaneKey,
    Object.entries(sleepingAgentSessionRecords)
  )
  const didPersist = await writeHostSleepingAgentSessions(
    beforeState,
    worktreeId,
    prospectiveSleeping
  )
  const rollbackMain = async (): Promise<void> => {
    if (!didPersist) {
      return
    }
    const current = get()
    try {
      await writeHostSleepingAgentSessions(
        current,
        worktreeId,
        current.sleepingAgentSessionsByPaneKey
      )
    } catch (error: unknown) {
      console.warn('[session] sleeping agent session rollback write failed:', error)
    }
  }
  if (
    didPersist &&
    !isHibernationPaneStillEligible({
      state: get(),
      worktreeId,
      paneKey,
      tabId,
      leafId,
      ptyId,
      expectedRuntimePtyIds,
      beforeInputAt,
      beforeStatusState
    })
  ) {
    await rollbackMain()
    throw new Error('agent_hibernation_state_changed_during_flush')
  }
  return { rollbackMain }
}
