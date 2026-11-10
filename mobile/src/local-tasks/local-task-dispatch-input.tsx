import { useState } from 'react'
import {
  LOCAL_TASK_TITLE_MAX,
  suggestLocalTaskWorkspaceName
} from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskListedHostId, type LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { LocalTaskDispatchComposer } from './local-task-dispatch-composer'
import { localTaskMentionChoices } from './local-task-dispatch-mentions'
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
  /** The paired host's word on its SSH hosts, keyed as the phone lists them. */
  hostConnected?: ReadonlyMap<string, boolean>
  /** The page shows all projects: `project` is only the fallback for a bare sentence. */
  allProjects?: boolean
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
  // With all projects in view, every project's repositories are offered (a task-only project
  // offers every repository on the host).
  const scopeRepos = props.allProjects
    ? props.library.projects.some((entry) => entry.repos.length === 0)
      ? []
      : [...new Set(props.library.projects.flatMap((entry) => entry.repos))]
    : props.project.repos
  const setups =
    catalog.state === 'ready'
      ? localTaskSetupsFor(catalog.catalog, props.site.endpoint, scopeRepos)
      : []
  // The project a task dispatched into a repository belongs to.
  const projectForRepo = (repoId: string) => {
    const owner = setups.find((entry) => entry.repoId === repoId)
    return (
      (owner
        ? props.library.projects.find((entry) => entry.repos.includes(owner.orcaProjectId))
        : undefined) ??
      props.library.projects.find((entry) => entry.repos.length === 0) ??
      props.project
    )
  }
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
  // Every repository on the host, only to name a workspace's repository.
  const repoLabels = new Map(
    (catalog.state === 'ready'
      ? localTaskSetupsFor(catalog.catalog, props.site.endpoint, [])
      : setups
    ).map((entry) => [entry.repoId, entry.label])
  )
  const listedHost = (ownerHostId: string) =>
    localTaskListedHostId(props.site.endpoint, ownerHostId) ?? ownerHostId
  const hostName = (ownerHostId: string) =>
    ownerHostId === 'local'
      ? props.site.label
      : (labels.get(listedHost(ownerHostId)) ?? localTaskHostLabel(listedHost(ownerHostId), null))
  const closeMention = () => setText((previous) => previous.replace(/(?:^|\s)@[^\s]*$/, ''))
  const keepMentioning = () => setText((previous) => previous.replace(/@[^\s]*$/, '@'))
  const mentionChoices = localTaskMentionChoices({
    query: mention ?? '',
    setups,
    candidates: workspaceState.status === 'ready' ? workspaceState.candidates : [],
    tasks: props.library.tasks,
    links: props.library.work.links,
    hostFilter,
    repoFilter,
    repoLabels,
    hosts: {
      name: hostName,
      connected: (ownerHostId) => props.hostConnected?.get(listedHost(ownerHostId)) ?? null
    },
    onHost: (ownerHostId) => {
      setHostFilter(ownerHostId)
      setTarget(null)
      keepMentioning()
    },
    onRepo: (repoId) => {
      setRepoFilter(repoId)
      setTarget(null)
      keepMentioning()
    },
    onWorkspace: (workspace) => {
      setTarget({ kind: 'workspace', workspace })
      closeMention()
    },
    onTask: (task) => {
      setTarget({ kind: 'task', task })
      closeMention()
    }
  })
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
      const scopedRepo = repoFilter ?? workspaceTarget?.repoId ?? null
      const project = targetTask
        ? (props.library.projects.find((entry) => entry.id === targetTask.projectId) ??
          props.project)
        : props.allProjects && scopedRepo
          ? projectForRepo(scopedRepo)
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
  const dispatchCopy = copy.work.dispatch
  const sendDisabled = !canDispatch || busy || !text.trim() || props.site.connState !== 'connected'
  const chips = [
    ...(target
      ? [
          {
            key: 'target',
            label:
              target.kind === 'task'
                ? `${target.task.ref} ${target.task.title}`
                : [repoLabels.get(target.workspace.repoId), target.workspace.displayName]
                    .filter(Boolean)
                    .join('/'),
            clear: () => setTarget(null)
          }
        ]
      : []),
    ...(hostFilter
      ? [{ key: 'host', label: hostName(hostFilter), clear: () => setHostFilter(null) }]
      : []),
    ...(repoFilter
      ? [
          {
            key: 'repo',
            label: repoLabels.get(repoFilter) ?? copy.dispatchRepo,
            clear: () => setRepoFilter(null)
          }
        ]
      : [])
  ]
  const onSend = target
    ? target.kind === 'task'
      ? dispatchCopy.onSendTask(target.task.ref)
      : dispatchCopy.onSendWorkspace(
          target.workspace.displayName,
          hostName(target.workspace.hostId)
        )
    : null
  return (
    <>
      <LocalTaskDispatchComposer
        text={text}
        onChangeText={setText}
        chips={chips}
        sendDisabled={sendDisabled}
        onSend={() => void dispatch()}
        hostLabel={props.site.label}
        onSendLine={onSend}
        hint={!target && !setup && catalog.state === 'ready' ? copy.dispatchNoSetup : null}
        error={error ?? launch.notice}
      />
      <LocalTaskLaunchSheet launch={launch} hostLabels={labels} workspaceHostLabel="" />
      <LocalTaskChoiceSheet
        visible={mention !== null}
        title={copy.work.mention.title}
        choices={mentionChoices}
        loading={workspaceState.status === 'loading'}
        message={workspaceState.status === 'failed' ? copy.loadFailed : copy.work.mention.hint}
        search={{
          query: mention ?? '',
          placeholder: copy.work.mention.search,
          onChange: (query) =>
            setText((previous) => previous.replace(/@[^\s]*$/, `@${query.replace(/\s/g, '')}`))
        }}
        onClose={closeMention}
      />
    </>
  )
}
