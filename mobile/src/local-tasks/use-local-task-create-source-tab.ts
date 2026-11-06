import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SmartNameMode } from '../../../src/shared/new-workspace/smart-workspace-source-results'
import type { LocalTasksHostState } from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LOCAL_TASK_CREATE_SOURCE_COPY_EN } from './local-task-create-source-copy'
import {
  buildLocalTaskCreateSourceRows,
  isLocalTaskCreateSourceRow,
  type LocalTaskCreateLibrary,
  type LocalTaskCreateSourceRow
} from './local-task-create-source-rows'
import type { LocalTaskCreateSource } from './use-local-task-create-source'

type Reading = {
  client: RpcClient
  status: 'loading' | 'ready' | 'failed'
  /** The last library read; kept while a later read is pending or failed. */
  library: LocalTaskCreateLibrary | null
  hostState: LocalTasksHostState | null
}

export type LocalTaskCreateSourceTab = {
  active: boolean
  rows: readonly LocalTaskCreateSourceRow[]
  loading: boolean
  /** Takes a Local row; false for any other row or one that cannot be picked. */
  select: (row: { kind: string }) => boolean
}

const NO_ROWS: LocalTaskCreateSourceRow[] = []

function blockedReason(
  reading: Reading | null,
  connected: boolean,
  libraryLabel: string
): string | null {
  if (!connected) {
    return LOCAL_TASK_CREATE_SOURCE_COPY_EN.offline(libraryLabel)
  }
  if (reading?.status === 'failed') {
    return localTasksCopy().loadFailed
  }
  if (reading?.hostState === 'read-only') {
    return LOCAL_TASK_CREATE_SOURCE_COPY_EN.readOnly
  }
  if (reading?.hostState && reading.hostState !== 'ready') {
    return LOCAL_TASK_CREATE_SOURCE_COPY_EN.unavailable
  }
  return null
}

/**
 * The drawer's Local tab: the library is read each time the user opens the tab while its Orca is
 * in contact, and again when contact comes back with the tab open — never on a timer, and a failed
 * read waits for the next of those. Out of contact the last read stays, greyed, behind a notice.
 */
export function useLocalTaskCreateSourceTab(
  source: LocalTaskCreateSource | null | undefined,
  mode: SmartNameMode,
  query: string
): LocalTaskCreateSourceTab {
  const scope = source?.tab ?? null
  const client = scope?.client ?? null
  const connected = scope?.connected === true
  const active = mode === 'local' && client !== null
  const [reading, setReading] = useState<Reading | null>(null)
  useEffect(() => {
    if (!active || !client || !connected) {
      return
    }
    let current = true
    setReading((previous) => ({
      client,
      status: 'loading',
      library: previous?.client === client ? previous.library : null,
      hostState: previous?.client === client ? previous.hostState : null
    }))
    const api = createLocalTasksApi(client)
    Promise.all([api.status(), api.projects(), api.tasks(), api.links()]).then(
      ([status, projects, tasks, links]) => {
        if (current) {
          setReading({
            client,
            status: 'ready',
            library: { projects, tasks, links },
            hostState: status.state
          })
        }
      },
      () => {
        if (current) {
          setReading((previous) =>
            previous?.client === client ? { ...previous, status: 'failed' } : previous
          )
        }
      }
    )
    return () => {
      current = false
    }
  }, [active, client, connected])
  const own = reading?.client === client ? reading : null
  const libraryLabel = scope?.libraryLabel ?? ''
  const orcaProjectId = scope?.orcaProjectId ?? null
  const rows = useMemo(() => {
    if (!active) {
      return NO_ROWS
    }
    const blocked = blockedReason(own, connected, libraryLabel)
    if (!own?.library) {
      return blocked ? buildLocalTaskCreateSourceRowsForNotice(blocked) : NO_ROWS
    }
    return buildLocalTaskCreateSourceRows({
      library: own.library,
      orcaProjectId,
      query,
      blocked,
      hasWorkspace: localTasksCopy().work.hasWorkspace
    })
  }, [active, connected, libraryLabel, orcaProjectId, own, query])
  const pickTask = scope?.select
  const tasks = own?.library?.tasks
  const select = useCallback(
    (row: { kind: string }): boolean => {
      if (!pickTask || !tasks || !isLocalTaskCreateSourceRow(row) || !row.task || row.disabled) {
        return false
      }
      pickTask(row.task, tasks)
      return true
    },
    [pickTask, tasks]
  )
  return {
    active,
    rows,
    loading: active && own?.status === 'loading',
    select
  }
}

function buildLocalTaskCreateSourceRowsForNotice(notice: string): LocalTaskCreateSourceRow[] {
  return buildLocalTaskCreateSourceRows({
    library: { projects: [], tasks: [], links: { workspaces: [], sessions: [] } },
    orcaProjectId: null,
    query: '',
    blocked: notice,
    hasWorkspace: () => ''
  })
}
