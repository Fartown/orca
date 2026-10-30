import { useCallback, useEffect, useState } from 'react'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../src/shared/execution-host'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { getProjectIdentityKey } from '../../../src/shared/project-host-setup-projection'
import { getHostContextLabel } from '../../../src/shared/worktree/host-context-labels'
import type { MobileWorkspaceRepo } from '../components/new-worktree-modal-types'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import type { MobileComposerSource } from '../tasks/use-mobile-composer-source'
import type { RpcClient } from '../transport/rpc-client'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { LOCAL_TASK_CREATE_SOURCE_COPY_EN } from './local-task-create-source-copy'
import {
  createLocalTaskSourcedWorkspace,
  localTaskCreateOwner,
  type LocalTaskCreateRun
} from './local-task-create-source-start'
import { useLocalTaskLibraryOffersTasks } from './local-task-library-presence'
import { createLocalTaskOperationIds } from './local-task-operation-ids'

/** What the drawer's Local tab needs from the sheet: where to read, and how to pick. */
export type LocalTaskCreateSourceTabScope = {
  /** The library's client while the tab is offered; null otherwise. */
  client: RpcClient | null
  connected: boolean
  /** The library's Orca, named for "X is not connected". */
  libraryLabel: string
  /** The picked repo's Orca project; its task projects rank first. */
  orcaProjectId: string | null
  select: (task: LocalTask, tasks: readonly LocalTask[]) => void
}

export type LocalTaskCreateSource = {
  /** Create From offers Local: a git repo whose Orca advertises local tasks, has a project, shows Local. */
  offered: boolean
  /** The task this workspace is for, while the picked repo's library is the one it came from. */
  picked: LocalTask | null
  clear: () => void
  /** Runs instead of the sheet's own create while a task is picked. */
  create: LocalTaskCreateRun | null
  tab: LocalTaskCreateSourceTabScope
}

type Advertised = { client: RpcClient; capabilities: readonly string[] | null }

/**
 * The library's client once its Orca advertises `local-tasks.v1`, and for a server's library the
 * paired Orca too, which is what relays the phone's task calls there. Asked once per sheet opening;
 * an older Orca is never sent a `localTasks.*` call, so Local is simply not offered there.
 */
function useAdvertisingLibrary(
  visible: boolean,
  desktopClient: RpcClient | null,
  client: RpcClient | null,
  key: string
): { client: RpcClient; capabilities: readonly string[] } | null {
  const [answer, setAnswer] = useState<Advertised | null>(null)
  useEffect(() => {
    if (!visible || !client || !desktopClient) {
      return
    }
    let current = true
    const capabilitiesOf = (target: RpcClient, hostKey: string) =>
      taskRuntimeStatusRead
        .requestSingleFlight(target, hostKey)
        .then((reply) => taskRuntimeStatusRead.interpret(reply).capabilities ?? [])
    void Promise.all([
      capabilitiesOf(client, key),
      client === desktopClient ? null : capabilitiesOf(desktopClient, 'self')
    ]).then(
      ([own, desktop]) => {
        if (!current) {
          return
        }
        const advertises =
          hostAdvertisesLocalTasks(own) && (desktop === null || hostAdvertisesLocalTasks(desktop))
        setAnswer({ client, capabilities: advertises ? own : null })
      },
      () => {}
    )
    return () => {
      current = false
    }
  }, [client, desktopClient, key, visible])
  return answer?.client === client && answer.capabilities
    ? { client: answer.client, capabilities: answer.capabilities }
    : null
}

/** Whether `client` is in contact now, read again whenever its connection changes. */
function useClientConnected(client: RpcClient | null): boolean {
  const [, setChanges] = useState(0)
  useEffect(
    () => (client ? client.onStateChange(() => setChanges((count) => count + 1)) : undefined),
    [client]
  )
  return client?.getState() === 'connected'
}

type TaskPick = { client: RpcClient; task: LocalTask; tasks: readonly LocalTask[] }

/**
 * Create From's Local source on the phone's new-workspace sheet, as the desktop composer has it
 * (REQ-009): offered for a git repo whose Orca holds a task library with a project and shows
 * Local; the picked task shows as the source pill, names the workspace, and once created the
 * workspace is linked in that Orca's library and the task is sent as the agent's first message.
 * Out of contact the tab stays, greyed, from what was last read; nothing is asked until contact
 * comes back.
 */
export function useLocalTaskCreateSource(args: {
  visible: boolean
  /** The paired Orca's client. */
  desktopClient: RpcClient | null
  /** The picked repo's: the paired Orca's own, or a server's scoped view. */
  client: RpcClient | null
  repo: MobileWorkspaceRepo | null
  repoIsGit: boolean
  hostLabelById?: ReadonlyMap<ExecutionHostId, string>
  hostPlatform: NodeJS.Platform | null
  composer: Pick<MobileComposerSource, 'name' | 'setName' | 'handleClearSmartNameSelection'>
}): LocalTaskCreateSource {
  const { repo, composer } = args
  const owner = repo && args.repoIsGit ? localTaskCreateOwner(repo) : null
  const advertised = useAdvertisingLibrary(
    args.visible,
    args.desktopClient,
    owner ? args.client : null,
    owner?.endpoint.key ?? ''
  )
  const library = advertised?.client ?? null
  const connected = useClientConnected(library)
  const offered = useLocalTaskLibraryOffersTasks(library, connected) === true
  const labels = { hostLabelById: args.hostLabelById, hostPlatform: args.hostPlatform }
  const libraryLabel = getHostContextLabel(
    owner?.endpoint.executionHost ?? LOCAL_EXECUTION_HOST_ID,
    labels
  )
  const [ids] = useState(() => ({
    link: createLocalTaskOperationIds(),
    record: createLocalTaskOperationIds()
  }))
  const [pick, setPick] = useState<TaskPick | null>(null)
  // Why derived: a repo on another Orca hides the pick; switching back shows it again.
  const picked = pick && offered && pick.client === library ? pick : null
  const { name, setName, handleClearSmartNameSelection } = composer
  const select = useCallback(
    (task: LocalTask, tasks: readonly LocalTask[]) => {
      if (!library) {
        return
      }
      // Why: one source per workspace; a task replaces an issue, PR or branch picked before.
      handleClearSmartNameSelection()
      setName(suggestLocalTaskWorkspaceName(task.ref, task.title))
      setPick({ client: library, task, tasks })
    },
    [handleClearSmartNameSelection, library, setName]
  )
  const clear = useCallback(() => {
    if (picked && name === suggestLocalTaskWorkspaceName(picked.task.ref, picked.task.title)) {
      setName('')
    }
    setPick(null)
  }, [name, picked, setName])
  const create: LocalTaskCreateRun | null =
    picked && advertised && owner && repo
      ? async (request) => {
          if (picked.client.getState() !== 'connected') {
            return { error: LOCAL_TASK_CREATE_SOURCE_COPY_EN.offline(libraryLabel) }
          }
          return createLocalTaskSourcedWorkspace({
            client: picked.client,
            capabilities: advertised.capabilities,
            ids,
            task: picked.task,
            tasks: picked.tasks,
            repoId: repo.id,
            ownerHostId: owner.ownerHostId,
            hostLabel: getHostContextLabel(getRepoExecutionHostId(repo), labels),
            request,
            copy: localTasksCopy()
          })
        }
      : null
  return {
    offered,
    picked: picked?.task ?? null,
    clear,
    create,
    tab: {
      client: offered ? library : null,
      connected,
      libraryLabel,
      orcaProjectId: repo ? getProjectIdentityKey(repo) : null,
      select
    }
  }
}
