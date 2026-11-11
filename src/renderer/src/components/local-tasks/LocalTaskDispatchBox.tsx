import { useEffect, useMemo, useRef, useState } from 'react'
import { ImeTextarea } from '@/lib/ime-text-field'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { isWebClientLocation } from '@/lib/web-client-location'
import { filterEnabledTuiAgents, pickTuiAgent } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { askLocalTaskDispatcher } from '@/local-tasks/local-task-dispatcher-ask'
import { openLocalTaskDispatcher } from '@/local-tasks/local-task-dispatcher-session'
import { LocalTaskDispatchMentionMenu } from './LocalTaskDispatchMentionMenu'
import { LocalTaskDispatchFooter, type LocalTaskDispatchMode } from './LocalTaskDispatchFooter'
import {
  LocalTaskDispatchProjectChoice,
  LocalTaskDispatchTargets
} from './LocalTaskDispatchTargets'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { findMentionQuery } from '@/components/pull-request-page/mentions/query'
import { buildSidebarHostOptionsForAllHosts } from '@/components/sidebar/sidebar-host-options'
import { selectWslHostsServing } from '@/components/sidebar/use-wsl-hosts-enabled'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import { useBoundedHostRows } from '@/components/host-picker/use-bounded-host-rows'
import { createDispatchAppSelector } from '@/local-tasks/local-task-dispatch-app-selector'
import {
  liveLocalTaskDispatchTargets,
  localTaskDispatchCandidates,
  type LocalTaskDispatchCandidate
} from '@/local-tasks/local-task-dispatch-candidates'
import {
  dispatchLocalTask,
  type LocalTaskDispatchReceipt as Receipt
} from '@/local-tasks/local-task-dispatch-launch'
import {
  createDispatchProjectForRepo,
  projectsForDispatchTarget
} from '@/local-tasks/local-task-dispatch-project'
import { dispatchLocalTaskToWorkspaces } from '@/local-tasks/local-task-dispatch-multiple'
import { useLocalTaskDispatchFocusRequest } from '@/local-tasks/local-task-dispatch-focus'
import {
  offerLocalTaskDispatchUndo,
  offerLocalTaskDispatchBatchUndo
} from '@/local-tasks/local-task-dispatch-undo'
import {
  useLocalTasksDomain,
  useWritableLocalTaskEndpoints
} from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { LocalTaskDispatchReceipt } from './LocalTaskDispatchReceipt'

export function LocalTaskDispatchBox(): React.JSX.Element {
  const [text, setText] = useState('')
  const [targets, setTargets] = useState<LocalTaskDispatchCandidate[]>([])
  const [hostFilter, setHostFilter] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [batchMessage, setBatchMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<LocalTaskDispatchMode>('dispatch')
  const [chosenAgent, setChosenAgent] = useState<TuiAgent | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const focusRequest = useLocalTaskDispatchFocusRequest()
  const app = useAppStore(useMemo(() => createDispatchAppSelector(), []))
  const hostOptions = useMemo(
    () =>
      buildSidebarHostOptionsForAllHosts({
        repos: app.repos,
        sshTargetLabels: app.sshTargetLabels,
        sshConnectionStates: app.sshConnectionStates,
        runtimeEnvironments: app.runtimeEnvironments,
        runtimeStatusByEnvironmentId: app.runtimeStatusByEnvironmentId,
        hostLabelOverrides: getHostDisplayLabelOverrides(app.settings),
        wslHostStatuses: app.wslHostStatuses,
        wslHostsEnabled: selectWslHostsServing(app),
        wslHostServerFilesMissing: app.wslHostServerFiles === 'missing'
      }),
    [app]
  )
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const projects = useLocalTasksDomain((state) => state.projects)
  const links = useLocalTasksDomain((state) => state.links)
  const writableEndpoints = useWritableLocalTaskEndpoints()
  const lastProjectId = useLocalTasksDomain(
    (state) => state.preferences.dispatchLastProject ?? null
  )
  const candidates = useMemo(
    () => localTaskDispatchCandidates(app, tasks, hostOptions, links, writableEndpoints),
    [app, hostOptions, links, tasks, writableEndpoints]
  )
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const agents = useMemo(() => {
    const enabled = new Set(
      filterEnabledTuiAgents(
        getAgentCatalog().map((entry) => entry.id),
        app.settings?.disabledTuiAgents
      )
    )
    return getAgentCatalog().filter((entry) => enabled.has(entry.id))
  }, [app.settings?.disabledTuiAgents])
  const preferredAgent = pickTuiAgent(
    app.settings?.defaultTuiAgent,
    agents.map((item) => item.id),
    app.settings?.disabledTuiAgents
  )
  const agent =
    chosenAgent && agents.some((entry) => entry.id === chosenAgent) ? chosenAgent : preferredAgent
  const liveTargets = useMemo(
    () => liveLocalTaskDispatchTargets(targets, candidates),
    [candidates, targets]
  )
  const picked = liveTargets[0]
  const projectChoices = picked ? projectsForDispatchTarget(app, picked, projects) : []
  const orphanRepo =
    picked?.kind === 'workspace'
      ? candidates.find(
          (candidate): candidate is Extract<LocalTaskDispatchCandidate, { kind: 'repo' }> =>
            candidate.kind === 'repo' &&
            candidate.repo.id === picked.worktree.repoId &&
            candidate.hostId === picked.hostId
        )
      : picked?.kind === 'repo'
        ? picked
        : undefined
  const selectedProject =
    projectChoices.find((project) => project.id === projectId) ??
    projectChoices.find((project) => project.id === lastProjectId) ??
    projectChoices[0]
  const filtered = candidates.filter(
    (candidate) =>
      (hostFilter === null || candidate.kind === 'host' || candidate.hostId === hostFilter) &&
      (query === null ||
        `${candidate.label} ${candidate.detail}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      !targets.some((selected) => selected.id === candidate.id)
  )
  const selectedRows = useBoundedHostRows(targets)

  useEffect(() => {
    if (focusRequest > 0) {
      input.current?.focus()
    }
  }, [focusRequest])

  const choose = (candidate: LocalTaskDispatchCandidate): void => {
    if (!candidate.available) {
      return
    }
    if (candidate.kind === 'host') {
      setHostFilter(candidate.hostId)
    } else {
      setTargets((current) => [...current, candidate])
      setProjectId(null)
    }
    const textarea = input.current
    const mention = textarea ? findMentionQuery(textarea.value, textarea.selectionStart) : null
    if (mention) {
      setText(
        (current) =>
          current.slice(0, mention.atIndex) +
          current.slice(textarea?.selectionStart ?? current.length)
      )
    }
    setQuery(null)
    setActiveId(null)
    requestAnimationFrame(() => input.current?.focus())
  }

  const insertMention = (): void => {
    const textarea = input.current
    const at = textarea?.selectionStart ?? text.length
    setText(`${text.slice(0, at)}@${text.slice(at)}`)
    setQuery('')
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(at + 1, at + 1)
    })
  }

  const openDispatcherOnly = (): void => {
    if (agent) {
      void openLocalTaskDispatcher(agent)
    }
  }

  const submit = async (createProject = false): Promise<void> => {
    if (!agent || busy || !text.trim() || !picked) {
      return
    }
    let project: LocalTaskProject | undefined = selectedProject
    if (!project && orphanRepo && createProject) {
      setBusy(true)
      try {
        project = (await createDispatchProjectForRepo(orphanRepo)) ?? undefined
      } finally {
        setBusy(false)
      }
    }
    if (!project) {
      return
    }
    setBusy(true)
    try {
      if (liveTargets.length > 1) {
        const batch = await dispatchLocalTaskToWorkspaces({
          targets: liveTargets.filter(
            (target): target is Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }> =>
              target.kind === 'workspace'
          ),
          text,
          agent,
          project
        })
        setBatchMessage(batch.message)
        setReceipts(batch.receipts)
        offerLocalTaskDispatchBatchUndo(batch)
        if (batch.message === null) {
          setText('')
          setTargets([])
          setHostFilter(null)
        }
        return
      }
      const next = await dispatchLocalTask({ target: picked, text, agent, project })
      setReceipts([next])
      // Why cleared once anything went out: the same words sent again would reach the agent twice.
      if (next.kind === 'launched' || next.kind === 'appended' || next.kind === 'unrecorded') {
        setText('')
        setTargets([])
        setHostFilter(null)
      }
      offerLocalTaskDispatchUndo(next)
    } finally {
      setBusy(false)
    }
  }

  const toDispatcher = mode === 'ask' || targets.length === 0
  const dispatcherOffered = !isWebClientLocation()
  const ask = async (): Promise<void> => {
    if (!agent || busy || !dispatcherOffered) {
      return
    }
    setBusy(true)
    try {
      const sent = await askLocalTaskDispatcher({ agent, text, askOnly: mode === 'ask' })
      if (sent) {
        setText('')
      }
    } finally {
      setBusy(false)
    }
  }
  const send = (): void => {
    if (!text.trim()) {
      return
    }
    void (toDispatcher ? ask() : submit())
  }
  const blockedReason = !agent
    ? translate('localTasks.dispatch.noAgent', 'Turn on an agent in Settings → Agents first.')
    : toDispatcher && !dispatcherOffered
      ? translate(
          'localTasks.dispatch.webNoDispatcher',
          'The dispatcher runs in the desktop app. Here, @ a workspace or repository to dispatch.'
        )
      : !toDispatcher && targets.length > 1 && targets.some((target) => target.kind !== 'workspace')
        ? translate(
            'localTasks.dispatch.multiOnlyWorkspaces',
            'Several targets work only with workspaces.'
          )
        : !toDispatcher && liveTargets.some((target) => !target.available)
          ? translate('localTasks.dispatch.disconnected', 'Not connected')
          : null
  const sendDisabled =
    busy || !text.trim() || blockedReason !== null || (!toDispatcher && !selectedProject)
  const visible = query === null ? [] : filtered.filter((candidate) => candidate.available)
  const active =
    query === null
      ? null
      : (visible.find((candidate) => candidate.id === activeId) ?? visible[0] ?? null)
  const moveActive = (step: number): void => {
    if (visible.length === 0) {
      return
    }
    const at = active ? visible.findIndex((candidate) => candidate.id === active.id) : -1
    setActiveId(visible[(at + step + visible.length) % visible.length]?.id ?? null)
  }

  return (
    <div className="@container/local-task-dispatch relative flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 pt-2.5 pb-2 shadow-xs">
      <LocalTaskDispatchTargets
        hostLabel={
          hostFilter
            ? (hostOptions.find((host) => host.id === hostFilter)?.label ?? hostFilter)
            : null
        }
        onClearHost={() => setHostFilter(null)}
        rows={selectedRows}
        count={targets.length}
        onRemove={(id) => setTargets((current) => current.filter((item) => item.id !== id))}
      />
      <ImeTextarea
        ref={input}
        value={text}
        rows={1}
        className="scrollbar-sleek field-sizing-content max-h-40 min-h-6 w-full min-w-0 resize-none bg-transparent p-0 font-sans text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={translate(
          'localTasks.dispatch.placeholder',
          'What should be done? @ a workspace or repository, then describe the task'
        )}
        aria-label={translate('localTasks.dispatch.label', 'Dispatch a task')}
        onChange={(event) => {
          setText(event.target.value)
          setQuery(findMentionQuery(event.target.value, event.target.selectionStart)?.query ?? null)
        }}
        onKeyUp={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            return
          }
          setQuery(
            findMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)
              ?.query ?? null
          )
        }}
        onKeyDown={(event) => {
          if (query !== null && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            moveActive(event.key === 'ArrowDown' ? 1 : -1)
            return
          }
          if (query !== null && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setQuery(null)
            return
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (query !== null && active) {
              choose(active)
            } else if (!sendDisabled) {
              send()
            }
          }
        }}
      />
      {query !== null ? (
        <LocalTaskDispatchMentionMenu
          candidates={filtered}
          activeId={active?.id ?? null}
          app={app}
          links={links}
          tasksById={tasksById}
          onChoose={choose}
          onHover={setActiveId}
        />
      ) : null}
      <LocalTaskDispatchFooter
        agents={agents}
        agent={agent}
        defaultAgent={preferredAgent}
        onAgentChange={setChosenAgent}
        mode={mode}
        onModeChange={setMode}
        dispatcherOffered={dispatcherOffered}
        busy={busy}
        runOn={picked && !toDispatcher ? picked.detail || picked.hostId || '' : null}
        sendDisabled={sendDisabled}
        blockedReason={blockedReason}
        onMention={insertMention}
        onExpand={() => void (text.trim() ? ask() : openDispatcherOnly())}
        onSend={send}
      />
      {toDispatcher ? null : (
        <LocalTaskDispatchProjectChoice
          choices={projectChoices}
          selectedId={selectedProject?.id ?? null}
          onPick={(id) => {
            setProjectId(id)
            void localTasksClient.setPreference('dispatchLastProject', id).catch(() => {})
          }}
          orphanRepoLabel={orphanRepo?.label ?? null}
          busy={busy}
          onCreate={() => void submit(true)}
        />
      )}
      {batchMessage ? <p className="text-xs text-destructive">{batchMessage}</p> : null}
      {agent
        ? receipts.map((receipt) => (
            <LocalTaskDispatchReceipt
              key={`${receipt.target.id}:${receipt.taskId}`}
              receipt={receipt}
              agent={agent}
              onChange={(next) =>
                setReceipts((current) =>
                  current.flatMap((item) => (item === receipt ? (next ? [next] : []) : [item]))
                )
              }
            />
          ))
        : null}
    </div>
  )
}
