import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { localTaskLinkWorkspaceId } from '../../../src/shared/local-tasks/local-task-workspace-match'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { ConfirmModal } from '../components/ConfirmModal'
import { MOBILE_TUI_AGENT_LABELS, isMobileTuiAgent } from '../tasks/mobile-tui-agents'
import { spacing } from '../theme/mobile-theme'
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
import { localTaskSessionViews, localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskSetupsFor, pickLocalTaskStartSetup } from './local-task-project-setups'
import { LOCAL_TASK_SESSION_DOT } from './local-task-session-dots'
import { localTaskWorkspaceHref } from './local-task-work-navigation'
import { LocalTaskWorkspaceLinkSheet } from './local-task-workspace-link-sheet'
import { LocalTaskWorkspaceReviewLine } from './local-task-workspace-review-line'
import { localTaskWorkspaceVerdict } from './local-task-workspace-row'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskHostLabels } from './use-local-task-host-labels'
import { useLocalTaskLaunch } from './use-local-task-launch'
import { useLocalTaskProjectCatalog } from './use-local-task-project-catalog'
import { useLocalTaskWorkspaceListing } from './use-local-task-workspace-listing'
import type { LocalTasksLibrary } from './use-local-tasks-library'

function agentLabel(agent: string | null): string {
  return agent && isMobileTuiAgent(agent) ? MOBILE_TUI_AGENT_LABELS[agent] : (agent ?? '')
}

function SmallButton(props: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[localTaskStyles.smallButton, props.disabled && localTaskStyles.disabled]}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled === true }}
      onPress={props.onPress}
    >
      <Text style={localTaskStyles.smallButtonText}>{props.label}</Text>
    </Pressable>
  )
}

/**
 * The task's workspace and sessions, with Start work, New session, link and unlink. Any level may
 * start its own workspace; one without works in the nearest ancestor's (REQ-009). Every button that
 * is off says why on the card: a host out of contact, a catalog not published, a library that is
 * read-only (the page's notice).
 */
export function LocalTaskWorkSection(props: {
  task: LocalTask
  library: LocalTasksLibrary
  api: LocalTasksApi
  site: LocalTaskSite
  canWrite: boolean
  /** Opens a linked session's screen; returns why it can't, when it can't. */
  onOpenSession: (taskSessionId: string) => string | null
  onNavigate: (href: string) => void
}) {
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
  const sessions = localTaskSessionViews({
    task,
    tasks: library.tasks,
    links: library.work.links,
    snapshot: library.work.progress,
    inContact: site.connState === 'connected'
  })
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
      ? localTaskHostLabel(workspaceHost, labels.get(workspaceHost) ?? workspace.hostLabelSnapshot)
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

  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{work.workspaceSection}</Text>
      <View style={[localTaskStyles.card, styles.card]}>
        {workspace ? (
          <>
            <Pressable
              onPress={openWorkspace}
              disabled={gone}
              accessibilityRole="button"
              accessibilityLabel={work.openWorkspace}
            >
              <Text style={localTaskStyles.rowValue} numberOfLines={1}>
                {workspace.nameSnapshot ?? workspace.worktreeId ?? workspace.folderWorkspaceId}
              </Text>
              <Text style={localTaskStyles.meta} numberOfLines={1}>
                {[hostLabel, workspace.branchSnapshot].filter(Boolean).join(' · ')}
              </Text>
              {inheritedFrom ? (
                <Text style={localTaskStyles.hint} numberOfLines={1}>
                  {work.inheritedWorkspace(inheritedFrom.title)}
                </Text>
              ) : null}
            </Pressable>
            {verdict?.kind === 'found' && verdict.review ? (
              <LocalTaskWorkspaceReviewLine
                review={verdict.review}
                inContact={hostContact.contact.kind === 'in-contact'}
              />
            ) : null}
            {verdict?.kind === 'missing' ? (
              <Text style={localTaskStyles.errorText} testID="local-task-workspace-gone">
                {work.workspaceGone}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              {gone ? (
                startSetup ? (
                  <SmallButton
                    label={work.startAgain}
                    disabled={!canWrite}
                    onPress={() => startFromTask(true)}
                  />
                ) : null
              ) : (
                <SmallButton
                  label={work.openSessionAction}
                  disabled={!canWrite || hostOffline || verdict?.kind === 'missing'}
                  onPress={() =>
                    void launch.open({ mode: 'session', sessionTask: task, workspace }, hostLabel)
                  }
                />
              )}
              {ownWorkspace ? (
                <SmallButton
                  label={work.unlinkWorkspace}
                  disabled={!canWrite}
                  onPress={() => setConfirmUnlink(true)}
                />
              ) : null}
            </View>
          </>
        ) : (
          <Text style={localTaskStyles.hint}>{work.noWorkspace}</Text>
        )}
        {needsCatalog && (noSetupHint || (setups.length > 0 && !startSetup)) ? (
          <Text style={localTaskStyles.hint}>{noSetupHint ?? work.folderProjectHint}</Text>
        ) : null}
        {ownWorkspace ? null : (
          <View style={styles.buttons}>
            {startSetup ? (
              <SmallButton
                label={workspace ? work.startOwn : work.start}
                disabled={!canWrite || hostOffline}
                onPress={() => startFromTask(false)}
              />
            ) : null}
            <SmallButton
              label={work.linkExisting}
              disabled={!canWrite || catalog.state !== 'ready'}
              onPress={() => setLinking(true)}
            />
          </View>
        )}
        {hostOffline ? (
          <>
            {/* Why no automatic re-check: contact coming back is read when the user asks. */}
            <Text style={localTaskStyles.hint} testID="local-task-host-offline">
              {work.hostOffline(offlineLabel)}
            </Text>
            <SmallButton label={work.checkConnection} onPress={hostContact.refresh} />
          </>
        ) : libraryOffline ? (
          <Text style={localTaskStyles.hint} testID="local-task-library-offline">
            {work.hostOffline(site.label)}
          </Text>
        ) : null}
        {launch.busy ? <Text style={localTaskStyles.meta}>{work.starting}</Text> : null}
        {launch.notice ? <Text style={localTaskStyles.errorText}>{launch.notice}</Text> : null}
        {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
        {library.work.error && !libraryOffline ? (
          <Text style={localTaskStyles.errorText}>{work.workLoadFailed}</Text>
        ) : null}
      </View>
      {sessions.length > 0 ? (
        <>
          <Text style={localTaskStyles.sectionLabel}>{work.sessionsSection}</Text>
          <View style={localTaskStyles.card}>
            {sessions.map((view, index) => (
              <Pressable
                key={view.link.id}
                testID={`local-task-session-${view.link.id}`}
                style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
                accessibilityRole="button"
                accessibilityHint={canWrite ? work.sessionActionsHint : undefined}
                onPress={() => setError(props.onOpenSession(view.link.id))}
                onLongPress={canWrite ? () => setUnlinkingSession(view.link) : undefined}
                delayLongPress={350}
              >
                <AgentStateDot state={LOCAL_TASK_SESSION_DOT[view.state]} />
                <View style={styles.sessionMain}>
                  <Text style={localTaskStyles.rowValue} numberOfLines={1}>
                    {[
                      agentLabel(view.link.agent),
                      view.task && view.task.id !== task.id ? work.ofSubtask(view.task.title) : '',
                      work.sessionStates[view.state]
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {view.lastMessage ? (
                    <Text style={localTaskStyles.meta} numberOfLines={2}>
                      {view.lastMessage}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
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
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sessionMain: { flex: 1, gap: 2 }
})
