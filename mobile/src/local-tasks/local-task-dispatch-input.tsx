import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Send } from 'lucide-react-native'
import {
  LOCAL_TASK_TITLE_MAX,
  suggestLocalTaskWorkspaceName
} from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import {
  LocalTaskLaunchSheet,
  localTaskHostLabel,
  localTaskSetupLabel
} from './local-task-launch-sheet'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskSetupsFor, pickLocalTaskStartSetup } from './local-task-project-setups'
import { localTaskSessionViews, localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { sendLocalTaskReply } from './local-task-reply-send'
import {
  localTaskLinkHolding,
  localTaskLinkParamsFor,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskHostLabels } from './use-local-task-host-labels'
import { useLocalTaskLaunch } from './use-local-task-launch'
import { useLocalTaskProjectCatalog } from './use-local-task-project-catalog'
import { useLocalTaskWorkspaceCandidates } from './use-local-task-workspace-candidates'
import type { LocalTasksLibrary } from './use-local-tasks-library'

export function LocalTaskDispatchInput(props: {
  site: LocalTaskSite
  api: LocalTasksApi
  library: LocalTasksLibrary
  project: LocalTaskProject
  onNavigate: (href: string) => void
}) {
  const copy = localTasksCopy()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [linkIds] = useState(() => createLocalTaskOperationIds())
  const [commentIds] = useState(() => createLocalTaskOperationIds())
  const [hostFilter, setHostFilter] = useState<string | null>(null)
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [target, setTarget] = useState<
    | { kind: 'task'; task: LocalTask }
    | { kind: 'workspace'; workspace: LocalTaskWorkspaceCandidate }
    | null
  >(null)
  const mention = text.match(/(?:^|\s)@([^\s]*)$/)?.[1] ?? null
  const catalog = useLocalTaskProjectCatalog(props.site.pairedClient)
  const setups =
    catalog.state === 'ready'
      ? localTaskSetupsFor(catalog.catalog, props.site.endpoint, props.project.repos)
      : []
  const filteredSetups = setups.filter(
    (entry) =>
      (hostFilter === null || entry.ownerHostId === hostFilter) &&
      (repoFilter === null || entry.repoId === repoFilter)
  )
  const setup = pickLocalTaskStartSetup(filteredSetups, props.project)
  const labels = useLocalTaskHostLabels(
    props.site.pairedClient,
    setups.map((entry) => entry.hostId)
  )
  const workspaceState = useLocalTaskWorkspaceCandidates({
    client: props.site.connState === 'connected' ? props.site.client : null,
    key: props.site.endpoint.executionHost ?? props.site.hostId,
    open: mention !== null
  })
  const launch = useLocalTaskLaunch({
    site: props.site,
    api: props.api,
    library: props.library,
    copy,
    onNavigate: props.onNavigate
  })
  const matches = (value: string) => value.toLowerCase().includes((mention ?? '').toLowerCase())
  const candidates = workspaceState.status === 'ready' ? workspaceState.candidates : []
  const tasksByIdForChoice = new Map(props.library.tasks.map((entry) => [entry.id, entry]))
  const mentionChoices = [
    ...Array.from(new Map(setups.map((entry) => [entry.ownerHostId, entry])).values())
      .filter((entry) =>
        matches(localTaskHostLabel(entry.hostId, labels.get(entry.hostId)) || entry.ownerHostId)
      )
      .map((entry) => ({
        key: `host:${entry.ownerHostId}`,
        label: `${copy.dispatchHost} · ${localTaskHostLabel(entry.hostId, labels.get(entry.hostId)) || entry.ownerHostId}`,
        onPress: () => {
          setHostFilter(entry.ownerHostId)
          setTarget(null)
          setText((previous) => previous.replace(/@[^\s]*$/, '@'))
        }
      })),
    ...Array.from(new Map(setups.map((entry) => [entry.repoId, entry])).values())
      .filter(
        (entry) => (hostFilter === null || entry.ownerHostId === hostFilter) && matches(entry.label)
      )
      .map((entry) => ({
        key: `repo:${entry.repoId}`,
        label: `${copy.dispatchRepo} · ${entry.label}`,
        onPress: () => {
          setRepoFilter(entry.repoId)
          setTarget(null)
          setText((previous) => previous.replace(/@[^\s]*$/, '@'))
        }
      })),
    ...candidates
      .filter(
        (entry) =>
          (hostFilter === null || entry.hostId === hostFilter) &&
          (repoFilter === null || entry.repoId === repoFilter) &&
          matches(`${entry.displayName} ${entry.branch}`)
      )
      .map((entry) => ({
        key: `workspace:${entry.hostId}:${entry.worktreeId}`,
        label: `${copy.dispatchWorkspace} · ${entry.displayName}`,
        onPress: () => {
          setTarget({ kind: 'workspace', workspace: entry })
          setText((previous) => previous.replace(/(?:^|\s)@[^\s]*$/, ''))
        }
      })),
    ...props.library.tasks
      .filter((task) => {
        if (!matches(`${task.ref} ${task.title}`)) {
          return false
        }
        const workspace = localTaskWorkspaceLinkFor(
          task,
          tasksByIdForChoice,
          props.library.work.links
        )
        return (
          (hostFilter === null || workspace?.hostId === hostFilter) &&
          (repoFilter === null || workspace?.repoId === repoFilter)
        )
      })
      .map((task) => ({
        key: `task:${task.id}`,
        label: `${copy.dispatchTask} · ${task.ref} ${task.title}`,
        onPress: () => {
          setTarget({ kind: 'task', task })
          setText((previous) => previous.replace(/(?:^|\s)@[^\s]*$/, ''))
        }
      }))
  ]
  const dispatch = async () => {
    const message = text.trim()
    if (!message || busy || props.site.connState !== 'connected') {
      return
    }
    setBusy(true)
    try {
      const workspaceTarget = target?.kind === 'workspace' ? target.workspace : null
      const holder = workspaceTarget
        ? localTaskLinkHolding(props.library.work.links, workspaceTarget)
        : null
      const targetTask =
        target?.kind === 'task'
          ? (props.library.tasks.find((entry) => entry.id === target.task.id) ?? null)
          : holder
            ? (props.library.tasks.find((entry) => entry.id === holder.taskId) ?? null)
            : null
      const tasksById = new Map(props.library.tasks.map((entry) => [entry.id, entry]))
      const linkedWorkspace = targetTask
        ? localTaskWorkspaceLinkFor(targetTask, tasksById, props.library.work.links)
        : null
      const sessions = targetTask
        ? localTaskSessionViews({
            task: targetTask,
            tasks: props.library.tasks,
            links: props.library.work.links,
            snapshot: props.library.work.progress,
            inContact: true
          })
        : []
      const ownSessions = sessions.filter((session) => session.link.taskId === targetTask?.id)
      const resumable =
        ownSessions.find(
          (session) =>
            session.link.id === targetTask?.latestProgress?.sessionLinkId &&
            (session.state === 'done' || session.state === 'idle')
        ) ?? ownSessions.find((session) => session.state === 'done' || session.state === 'idle')
      if (targetTask && resumable) {
        const work = copy.work
        const sent = await sendLocalTaskReply({
          client: props.site.client,
          session: resumable.link,
          text: message,
          reasons: {
            missing: work.replySessionMissing,
            notConnected: work.replyNotConnected,
            inputNotCleared: work.replyInputNotCleared,
            inputRefused: work.replyInputRefused,
            chatNotReady: work.replyChatNotReady
          }
        })
        if (sent.kind === 'not-sent') {
          setError(work.replyNotSentBecause(sent.reason ?? ''))
          return
        }
        setText('')
        if (sent.kind === 'delivered') {
          const recorded = await sendLocalTaskWrite(
            commentIds,
            { taskId: targetTask.id, body: message },
            props.api.addComment
          )
          setError(localTaskWriteMessage(copy, recorded))
          if (recorded.kind === 'ok') {
            props.library.reload(['events'])
          }
        } else {
          setError(null)
        }
        return
      }
      const parentId = targetTask ? targetTask.id : null
      const project = targetTask
        ? (props.library.projects.find((entry) => entry.id === targetTask.projectId) ??
          props.project)
        : props.project
      const projectSetups =
        catalog.state === 'ready'
          ? localTaskSetupsFor(catalog.catalog, props.site.endpoint, project.repos).filter(
              (entry) =>
                (hostFilter === null || entry.ownerHostId === hostFilter) &&
                (repoFilter === null || entry.repoId === repoFilter)
            )
          : []
      const selectedSetup = pickLocalTaskStartSetup(projectSetups, project)
      if (!linkedWorkspace && !workspaceTarget && !selectedSetup) {
        setError(copy.dispatchNoSetup)
        return
      }
      const created = await sendLocalTaskWrite(
        ids,
        {
          projectId: project.id,
          title: message.split(/\r?\n/)[0].slice(0, LOCAL_TASK_TITLE_MAX),
          description: message,
          criteria: [],
          priority: 0 as const,
          labels: [],
          parentId
        },
        props.api.createTask
      )
      setError(localTaskWriteMessage(copy, created))
      if (created.kind !== 'ok') {
        return
      }
      const task = created.value.task
      props.library.acceptTasks([task])
      setText('')
      setTarget(null)
      if (linkedWorkspace) {
        await launch.open(
          { mode: 'session', sessionTask: task, workspace: linkedWorkspace },
          linkedWorkspace.hostLabelSnapshot ?? ''
        )
        return
      }
      if (workspaceTarget) {
        const linked = await sendLocalTaskWrite(
          linkIds,
          {
            taskId: task.id,
            ...localTaskLinkParamsFor(workspaceTarget, labels.get(workspaceTarget.hostId) ?? ''),
            linkedVia: 'manual' as const
          },
          props.api.linkWorkspace
        )
        setError(localTaskWriteMessage(copy, linked, props.library.tasks))
        if (linked.kind === 'ok') {
          props.library.reload(['links'])
          await launch.open(
            { mode: 'session', sessionTask: task, workspace: linked.value.workspace },
            labels.get(workspaceTarget.hostId) ?? ''
          )
        }
        return
      }
      if (!selectedSetup) {
        setError(copy.dispatchNoSetup)
        return
      }
      await launch.open(
        {
          mode: 'start',
          workspaceTask: task,
          sessionTask: task,
          name: suggestLocalTaskWorkspaceName(task.ref, task.title),
          setups: projectSetups,
          setup: selectedSetup
        },
        localTaskSetupLabel(selectedSetup, labels)
      )
    } finally {
      setBusy(false)
    }
  }
  const canDispatch = Boolean(setup || target)
  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          multiline
          placeholder={copy.dispatchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={copy.dispatchPlaceholder}
        />
        <Pressable
          style={[styles.send, (!canDispatch || busy || !text.trim()) && localTaskStyles.disabled]}
          disabled={!canDispatch || busy || !text.trim() || props.site.connState !== 'connected'}
          onPress={() => void dispatch()}
          accessibilityRole="button"
          accessibilityLabel={copy.dispatchButton}
        >
          <Send size={17} color={colors.bgBase} />
        </Pressable>
      </View>
      <Text style={localTaskStyles.meta}>
        {target
          ? `${copy.dispatchTarget} ${target.kind === 'task' ? `${target.task.ref} ${target.task.title}` : target.workspace.displayName}`
          : setup
            ? `${copy.dispatchRunOn} ${localTaskSetupLabel(setup, labels)}`
            : copy.dispatchNoSetup}
      </Text>
      {hostFilter || repoFilter || target ? (
        <Pressable
          onPress={() => {
            setHostFilter(null)
            setRepoFilter(null)
            setTarget(null)
          }}
          accessibilityRole="button"
        >
          <Text style={localTaskStyles.meta}>{copy.clearFilters}</Text>
        </Pressable>
      ) : null}
      {error || launch.notice ? (
        <Text style={localTaskStyles.errorText}>{error ?? launch.notice}</Text>
      ) : null}
      <LocalTaskLaunchSheet launch={launch} hostLabels={labels} workspaceHostLabel="" />
      <LocalTaskChoiceSheet
        visible={mention !== null}
        title={copy.dispatchChooseTarget}
        choices={mentionChoices}
        loading={workspaceState.status === 'loading'}
        message={workspaceState.status === 'failed' ? copy.loadFailed : null}
        search={{
          query: mention ?? '',
          placeholder: copy.dispatchChooseTarget,
          onChange: (query) =>
            setText((previous) => previous.replace(/@[^\s]*$/, `@${query.replace(/\s/g, '')}`))
        }}
        onClose={() => setText((previous) => previous.replace(/(?:^|\s)@[^\s]*$/, ''))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radii.control,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
