import { useRef, useState, type ReactNode } from 'react'
import { Text } from 'react-native'
import { FolderOpen, Link2, Play, RotateCcw, Unlink } from 'lucide-react-native'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { localTaskLinkWorkspaceId } from '../../../src/shared/local-tasks/local-task-workspace-match'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskListedHostId, type LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { useLocalTaskHostContact } from './local-task-host-contact'
import {
  LocalTaskLaunchSheet,
  localTaskHostLabel,
  localTaskSetupLabel
} from './local-task-launch-sheet'
import {
  createLocalTaskOperationIds,
  sendLocalTaskWrite,
  type LocalTaskOperationIds
} from './local-task-operation-ids'
import { localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskSetupsFor, pickLocalTaskStartSetup } from './local-task-project-setups'
import { localTaskWorkspaceHref } from './local-task-work-navigation'
import { LocalTaskWorkspaceLinkSheet } from './local-task-workspace-link-sheet'
import { localTaskWorkspaceVerdict } from './local-task-workspace-row'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskHostLabels } from './use-local-task-host-labels'
import { useLocalTaskLaunch } from './use-local-task-launch'
import { useLocalTaskProjectCatalog } from './use-local-task-project-catalog'
import { useLocalTaskWorkspaceListing } from './use-local-task-workspace-listing'
import type { LocalTasksLibrary } from './use-local-tasks-library'

export type LocalTaskWorkControls = {
  /** The head's main button (m4): a new session in the task's workspace, else Start work. */
  primary: { label: string; disabled: boolean; onPress: () => void } | null
  /** Everything else the task's workspace offers, for the "…" menu. */
  menuActions: ActionSheetAction[]
  /** Why a button is off, what is starting, what failed: said under the head. */
  notices: ReactNode
  /** Sheets and confirmations the controls open. */
  sheets: ReactNode
  requestUnlinkSession: ((session: LocalTaskSessionLink) => void) | null
}

/**
 * The task's workspace and sessions as head controls: Start work, New session, link, open and
 * unlink. Any level may start its own workspace; one without works in the nearest ancestor's
 * (REQ-009). Every control that is off says why under the head: a host out of contact, a catalog
 * not published, a library that is read-only (the page's notice). Contact is read when the user
 * asks, never polled.
 */
export function useLocalTaskWorkControls(props: {
  task: LocalTask
  library: LocalTasksLibrary
  api: LocalTasksApi
  site: LocalTaskSite
  canWrite: boolean
  onNavigate: (href: string) => void
}): LocalTaskWorkControls {
  const copy = localTasksCopy()
  const work = copy.work
  const { library, task, site } = props
  const tasksById = new Map(library.tasks.map((entry) => [entry.id, entry]))
  const ownWorkspace = library.work.links.workspaces.find((link) => link.taskId === task.id) ?? null
  const workspace = ownWorkspace ?? localTaskWorkspaceLinkFor(task, tasksById, library.work.links)
  const inheritedFrom = workspace && !ownWorkspace ? tasksById.get(workspace.taskId) : undefined
  const project = library.projects.find((entry) => entry.id === task.projectId) ?? null
  // Read with a linked workspace too: Start work again needs the setups once it is deleted.
  const catalog = useLocalTaskProjectCatalog(site.pairedClient)
  const setups =
    catalog.state === 'ready' && project
      ? localTaskSetupsFor(catalog.catalog, site.endpoint, project.repos)
      : []
  const startSetup = project ? pickLocalTaskStartSetup(setups, project) : null
  const actionHostId = workspace?.hostId ?? startSetup?.ownerHostId ?? null
  const hostContact = useLocalTaskHostContact(site.client, site.endpoint, actionHostId)
  const hostOffline = hostContact.contact.kind === 'out-of-contact'
  // The library's own host gone (an SSH host's Orca): its reads fail because it is not connected.
  const libraryOffline = site.connState !== 'connected'
  const listing = useLocalTaskWorkspaceListing({
    client: site.client,
    key: site.endpoint.executionHost ?? site.hostId,
    subject: workspace
      ? [
          workspace.taskId,
          workspace.hostId,
          localTaskLinkWorkspaceId(workspace),
          workspace.linkedAt
        ]
          .map(String)
          .join('\u0000')
      : null,
    open: workspace !== null && site.connState === 'connected'
  })
  const verdict =
    workspace && listing.status === 'ready'
      ? localTaskWorkspaceVerdict(
          workspace,
          listing.listing,
          hostContact.contact.kind === 'in-contact'
        )
      : null
  // Only the task's own: an ancestor's deleted workspace is restarted from the ancestor.
  const gone = ownWorkspace !== null && verdict?.kind === 'missing'
  const workspaceHost = workspace
    ? (localTaskListedHostId(site.endpoint, workspace.hostId) ?? workspace.hostId)
    : null
  const labels = useLocalTaskHostLabels(site.pairedClient, [
    ...(workspaceHost ? [workspaceHost] : []),
    ...setups.map((setup) => setup.hostId)
  ])
  const launch = useLocalTaskLaunch({
    site,
    api: props.api,
    library,
    copy,
    onNavigate: props.onNavigate
  })
  const [linking, setLinking] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [unlinkingSession, setUnlinkingSession] = useState<LocalTaskSessionLink | null>(null)
  const [unlinkIds] = useState(() => createLocalTaskOperationIds())
  // Per session, so a resend after a lost answer replays that one unlink.
  const sessionUnlinkIds = useRef(new Map<string, LocalTaskOperationIds>())
  const [error, setError] = useState<string | null>(null)
  const canWrite = props.canWrite && !launch.busy

  const unlink = async () => {
    setConfirmUnlink(false)
    const outcome = await sendLocalTaskWrite(
      unlinkIds,
      { taskId: task.id },
      props.api.unlinkWorkspace
    )
    setError(localTaskWriteMessage(copy, outcome, library.tasks))
    library.reload(['links'])
  }
  const unlinkSession = async (session: LocalTaskSessionLink) => {
    setUnlinkingSession(null)
    let ids = sessionUnlinkIds.current.get(session.id)
    if (!ids) {
      ids = createLocalTaskOperationIds()
      sessionUnlinkIds.current.set(session.id, ids)
    }
    const outcome = await sendLocalTaskWrite(
      ids,
      { sessionLinkId: session.id },
      props.api.unlinkSession
    )
    setError(localTaskWriteMessage(copy, outcome, library.tasks))
    library.reload(['links'])
  }
  const startFromTask = (replace: boolean) => {
    if (startSetup) {
      void launch.open(
        {
          mode: 'start',
          workspaceTask: task,
          sessionTask: task,
          name: suggestLocalTaskWorkspaceName(task.ref, task.title),
          setups,
          setup: startSetup,
          ...(replace ? { replace: true } : {})
        },
        localTaskSetupLabel(startSetup, labels)
      )
    }
  }
  const openWorkspace = () => {
    const href = workspace
      ? localTaskWorkspaceHref({ hostId: site.hostId, endpoint: site.endpoint, link: workspace })
      : null
    if (href) {
      setError(null)
      props.onNavigate(href)
    } else {
      setError(work.cannotOpenHere)
    }
  }
  const hostLabel =
    workspace && workspaceHost
      ? workspace.hostId === 'local'
        ? site.label
        : localTaskHostLabel(
            workspaceHost,
            labels.get(workspaceHost) ?? workspace.hostLabelSnapshot
          )
      : ''
  // The host the offline line names: the workspace's, else the one Start work would create on.
  const offlineLabel = workspace
    ? hostLabel
    : startSetup
      ? localTaskHostLabel(startSetup.hostId, labels.get(startSetup.hostId))
      : ''
  const needsCatalog = !ownWorkspace || gone
  const noSetupHint =
    catalog.state === 'ready' && setups.length === 0
      ? project && project.repos.length > 0
        ? work.noSetupHint
        : work.noRepoOnHostHint
      : catalog.state === 'unavailable'
        ? work.catalogUnavailable
        : null
  const openSession = () =>
    workspace && void launch.open({ mode: 'session', sessionTask: task, workspace }, hostLabel)

  const primary: LocalTaskWorkControls['primary'] = gone
    ? startSetup
      ? { label: work.startAgain, disabled: !canWrite, onPress: () => startFromTask(true) }
      : null
    : workspace
      ? {
          label: work.openSessionAction,
          disabled: !canWrite || hostOffline || verdict?.kind === 'missing',
          onPress: openSession
        }
      : startSetup
        ? {
            label: work.start,
            disabled: !canWrite || hostOffline,
            onPress: () => startFromTask(false)
          }
        : null
  const menuActions: ActionSheetAction[] = [
    ...(workspace && !gone
      ? [{ label: work.openWorkspace, icon: FolderOpen, onPress: openWorkspace }]
      : []),
    ...(workspace && !ownWorkspace && startSetup
      ? [
          {
            label: work.startOwn,
            icon: Play,
            disabled: !canWrite || hostOffline,
            closeBeforePress: true,
            onPress: () => startFromTask(false)
          }
        ]
      : []),
    ...(ownWorkspace
      ? []
      : [
          {
            label: work.linkExisting,
            icon: Link2,
            disabled: !canWrite || catalog.state !== 'ready',
            closeBeforePress: true,
            onPress: () => setLinking(true)
          }
        ]),
    ...(ownWorkspace
      ? [
          {
            label: work.unlinkWorkspace,
            icon: Unlink,
            destructive: true,
            disabled: !canWrite,
            closeBeforePress: true,
            onPress: () => setConfirmUnlink(true)
          }
        ]
      : []),
    ...(hostOffline
      ? [{ label: work.checkConnection, icon: RotateCcw, onPress: hostContact.refresh }]
      : [])
  ]
  const hint = (text: string, testID?: string) => (
    <Text style={localTaskStyles.hint} testID={testID}>
      {text}
    </Text>
  )
  const notices = (
    <>
      {inheritedFrom ? hint(work.inheritedWorkspace(inheritedFrom.title)) : null}
      {verdict?.kind === 'missing' ? (
        <Text style={localTaskStyles.errorText} testID="local-task-workspace-gone">
          {work.workspaceGone}
        </Text>
      ) : null}
      {!workspace ? hint(work.noWorkspace) : null}
      {needsCatalog && (noSetupHint || (setups.length > 0 && !startSetup))
        ? hint(noSetupHint ?? work.folderProjectHint)
        : null}
      {/* Why no automatic re-check: contact coming back is read when the user asks. */}
      {hostOffline
        ? hint(work.hostOffline(offlineLabel), 'local-task-host-offline')
        : libraryOffline
          ? hint(work.hostOffline(site.label), 'local-task-library-offline')
          : null}
      {launch.busy ? <Text style={localTaskStyles.meta}>{work.starting}</Text> : null}
      {launch.notice ? <Text style={localTaskStyles.errorText}>{launch.notice}</Text> : null}
      {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
      {library.work.error && !libraryOffline ? (
        <Text style={localTaskStyles.errorText}>{work.workLoadFailed}</Text>
      ) : null}
    </>
  )
  const sheets = (
    <>
      <LocalTaskLaunchSheet launch={launch} hostLabels={labels} workspaceHostLabel={hostLabel} />
      <LocalTaskWorkspaceLinkSheet
        visible={linking}
        task={task}
        tasks={library.tasks}
        setups={setups}
        links={library.work.links}
        hostLabels={labels}
        site={site}
        api={props.api}
        onLinked={() => {
          setLinking(false)
          library.reload(['links', 'tasks'])
        }}
        onClose={() => setLinking(false)}
      />
      <ConfirmModal
        visible={confirmUnlink}
        title={work.unlinkWorkspaceTitle}
        message={work.unlinkWorkspaceMessage}
        confirmLabel={work.unlinkWorkspace}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => void unlink()}
        onCancel={() => setConfirmUnlink(false)}
      />
      <ConfirmModal
        visible={unlinkingSession !== null}
        title={work.unlinkSessionTitle}
        message={work.unlinkSessionMessage}
        confirmLabel={work.unlinkSession}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => unlinkingSession && void unlinkSession(unlinkingSession)}
        onCancel={() => setUnlinkingSession(null)}
      />
    </>
  )
  return {
    primary,
    menuActions,
    notices,
    sheets,
    requestUnlinkSession: canWrite ? setUnlinkingSession : null
  }
}
