import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTaskSessionState } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { ConfirmModal } from '../components/ConfirmModal'
import { MOBILE_TUI_AGENT_LABELS, isMobileTuiAgent } from '../tasks/mobile-tui-agents'
import { spacing } from '../theme/mobile-theme'
import type { AgentDotState } from '../worktree/agent-row-display'
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
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskSessionViews, localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskSetupsFor, pickLocalTaskStartSetup } from './local-task-project-setups'
import { localTaskWorkspaceHref } from './local-task-work-navigation'
import { LocalTaskWorkspaceLinkSheet } from './local-task-workspace-link-sheet'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskHostLabels } from './use-local-task-host-labels'
import { useLocalTaskLaunch } from './use-local-task-launch'
import { useLocalTaskProjectCatalog } from './use-local-task-project-catalog'
import type { LocalTasksLibrary } from './use-local-tasks-library'

const DOT_STATE: Record<LocalTaskSessionState, AgentDotState | 'unverifiable'> = {
  working: 'working',
  waiting: 'waiting',
  blocked: 'blocked',
  done: 'done',
  idle: 'idle',
  exited: 'interrupted',
  missing: 'unconfirmed',
  unknown: 'idle',
  unverifiable: 'unverifiable'
}

function agentLabel(agent: string | null): string {
  return agent && isMobileTuiAgent(agent) ? MOBILE_TUI_AGENT_LABELS[agent] : (agent ?? '')
}

function SmallButton(props: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[localTaskStyles.smallButton, props.disabled && localTaskStyles.disabled]}
      disabled={props.disabled}
      accessibilityRole="button"
      onPress={props.onPress}
    >
      <Text style={localTaskStyles.smallButtonText}>{props.label}</Text>
    </Pressable>
  )
}

/**
 * The task's workspace and sessions, with Start, Open a session, link and unlink. Any level may
 * start its own workspace; one without works in the nearest ancestor's (REQ-009).
 */
export function LocalTaskWorkSection(props: {
  task: LocalTask
  library: LocalTasksLibrary
  api: LocalTasksApi
  site: LocalTaskSite
  canWrite: boolean
  onOpenSession: (taskSessionId: string) => void
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
  const catalog = useLocalTaskProjectCatalog(ownWorkspace ? null : site.pairedClient)
  const setups =
    catalog.state === 'ready' && project
      ? localTaskSetupsFor(catalog.catalog, site.endpoint, project.repos)
      : []
  const startSetup = project ? pickLocalTaskStartSetup(setups, project) : null
  const actionHostId = workspace?.hostId ?? startSetup?.ownerHostId ?? null
  const hostContact = useLocalTaskHostContact(site.client, site.endpoint, actionHostId)
  const hostOffline = hostContact.contact.kind === 'out-of-contact'
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
  const [unlinkIds] = useState(() => createLocalTaskOperationIds())
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
    setError(localTaskWriteMessage(copy, outcome))
    library.reload(['links'])
  }
  const startFromTask = () => {
    if (startSetup) {
      void launch.open(
        {
          mode: 'start',
          workspaceTask: task,
          sessionTask: task,
          name: suggestLocalTaskWorkspaceName(task.ref, task.title),
          setups,
          setup: startSetup
        },
        localTaskSetupLabel(startSetup, labels)
      )
    }
  }
  const hostLabel =
    workspace && workspaceHost
      ? localTaskHostLabel(workspaceHost, labels.get(workspaceHost) ?? workspace.hostLabelSnapshot)
      : ''
  const noSetupHint =
    catalog.state === 'ready' && setups.length === 0
      ? project && project.repos.length > 0
        ? work.noSetupHint
        : work.noRepoOnHostHint
      : null

  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{work.workspaceSection}</Text>
      <View style={[localTaskStyles.card, styles.card]}>
        {workspace ? (
          <>
            <Pressable
              onPress={() => {
                const href = localTaskWorkspaceHref({
                  hostId: site.hostId,
                  endpoint: site.endpoint,
                  link: workspace
                })
                if (href) {
                  props.onNavigate(href)
                }
              }}
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
                  {work.inheritedWorkspace(inheritedFrom.ref)}
                </Text>
              ) : null}
            </Pressable>
            <View style={styles.buttons}>
              <SmallButton
                label={work.openSessionAction}
                disabled={!canWrite || hostOffline}
                onPress={() =>
                  void launch.open({ mode: 'session', sessionTask: task, workspace }, hostLabel)
                }
              />
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
        {ownWorkspace ? null : (
          <>
            {noSetupHint || (setups.length > 0 && !startSetup) ? (
              <Text style={localTaskStyles.hint}>{noSetupHint ?? work.folderProjectHint}</Text>
            ) : null}
            <View style={styles.buttons}>
              {startSetup ? (
                <SmallButton
                  label={workspace ? work.startOwn : work.start}
                  disabled={!canWrite || hostOffline}
                  onPress={startFromTask}
                />
              ) : null}
              <SmallButton
                label={work.linkExisting}
                disabled={!canWrite || catalog.state !== 'ready'}
                onPress={() => setLinking(true)}
              />
            </View>
          </>
        )}
        {hostOffline ? (
          <SmallButton label={work.checkConnection} onPress={hostContact.refresh} />
        ) : null}
        {launch.busy ? <Text style={localTaskStyles.meta}>{work.starting}</Text> : null}
        {launch.notice ? <Text style={localTaskStyles.errorText}>{launch.notice}</Text> : null}
        {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
        {library.work.error ? (
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
                onPress={() => props.onOpenSession(view.link.id)}
              >
                <AgentStateDot state={DOT_STATE[view.state]} />
                <View style={styles.sessionMain}>
                  <Text style={localTaskStyles.rowValue} numberOfLines={1}>
                    {[
                      agentLabel(view.link.agent),
                      view.task && view.task.id !== task.id ? work.ofSubtask(view.task.ref) : '',
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
    </>
  )
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sessionMain: { flex: 1, gap: 2 }
})
