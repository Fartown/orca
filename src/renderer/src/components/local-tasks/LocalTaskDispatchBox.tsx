import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { pickTuiAgent } from '../../../../shared/tui-agent-selection'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { findMentionQuery } from '@/components/pull-request-page/mentions/query'
import { useSidebarHostScopeOptions } from '@/components/sidebar/use-sidebar-host-scope-options'
import {
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

function createDispatchAppSelector(): (state: AppState) => AppState {
  let previous: { fields: readonly unknown[]; state: AppState } | null = null
  return (state) => {
    const fields = [
      state.repos,
      state.projects,
      state.projectHostSetups,
      state.worktreesByRepo,
      state.folderWorkspaces,
      state.detectedWorktreesByRepo,
      state.projectGroups,
      state.restoredRuntimeHostIdByWorkspaceSessionKey,
      state.activeWorktreeId,
      state.activeWorkspaceExecutionHostId,
      state.runtimeEnvironments,
      state.runtimeEnvironmentCatalogHydrated,
      state.removedRuntimeEnvironmentIds,
      state.runtimeStatusByEnvironmentId,
      state.sshConnectionStates,
      state.sshStateByEnvironment,
      state.sshTargetLabels,
      state.removedSshTargetLabels,
      state.settings
    ]
    const snapshot = previous
    if (snapshot && fields.every((field, index) => Object.is(field, snapshot.fields[index]))) {
      return snapshot.state
    }
    previous = { fields, state }
    return state
  }
}

export function LocalTaskDispatchBox(): React.JSX.Element {
  const [text, setText] = useState('')
  const [targets, setTargets] = useState<LocalTaskDispatchCandidate[]>([])
  const [hostFilter, setHostFilter] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [batchMessage, setBatchMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const focusRequest = useLocalTaskDispatchFocusRequest()
  const { hostOptions } = useSidebarHostScopeOptions()
  const app = useAppStore(useMemo(() => createDispatchAppSelector(), []))
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
  const agent = pickTuiAgent(
    app.settings?.defaultTuiAgent,
    getAgentCatalog().map((item) => item.id),
    app.settings?.disabledTuiAgents
  )
  const picked = targets[0]
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
  const filtered = candidates
    .filter(
      (candidate) =>
        (hostFilter === null || candidate.kind === 'host' || candidate.hostId === hostFilter) &&
        (query === null ||
          `${candidate.label} ${candidate.detail}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())) &&
        !targets.some((selected) => selected.id === candidate.id)
    )
    .slice(0, 30)

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
    requestAnimationFrame(() => input.current?.focus())
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
      if (targets.length > 1) {
        const batch = await dispatchLocalTaskToWorkspaces({
          targets: targets.filter(
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
      if (next.kind === 'launched' || next.kind === 'appended') {
        setText('')
        setTargets([])
        setHostFilter(null)
      }
      offerLocalTaskDispatchUndo(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap gap-1">
        {hostFilter ? (
          <Button size="xs" variant="outline" onClick={() => setHostFilter(null)}>
            {hostOptions.find((host) => host.id === hostFilter)?.label ?? hostFilter}
            <X className="size-3" />
          </Button>
        ) : null}
        {targets.map((target) => (
          <Button
            key={target.id}
            size="xs"
            variant="outline"
            onClick={() => setTargets((current) => current.filter((item) => item.id !== target.id))}
          >
            {target.label}
            <X className="size-3" />
          </Button>
        ))}
      </div>
      <Textarea
        variant="composite"
        ref={input}
        value={text}
        className="min-h-16"
        placeholder={translate(
          'localTasks.dispatch.placeholder',
          'What should be done? @ a workspace or repository, then describe the task'
        )}
        aria-label={translate('localTasks.dispatch.label', 'Dispatch a task')}
        onChange={(event) => {
          setText(event.target.value)
          setQuery(findMentionQuery(event.target.value, event.target.selectionStart)?.query ?? null)
        }}
        onKeyUp={(event) =>
          setQuery(
            findMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)
              ?.query ?? null
          )
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (query !== null && filtered[0]) {
              choose(filtered[0])
            } else {
              void submit()
            }
          }
        }}
      />
      {query !== null ? (
        <div className="scrollbar-sleek absolute inset-x-3 top-full z-30 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-floating">
          <Command shouldFilter={false} surface="inline" density="menu">
            <CommandList>
              <CommandEmpty>
                {translate('localTasks.dispatch.noMatches', 'No matches')}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((candidate) => (
                  <CommandItem
                    key={candidate.id}
                    value={candidate.id}
                    disabled={!candidate.available}
                    onSelect={() => choose(candidate)}
                  >
                    <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
                    <span className="text-2xs text-muted-foreground">
                      {candidate.available
                        ? candidate.detail
                        : translate('localTasks.dispatch.disconnected', 'Not connected')}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {picked
            ? translate('localTasks.dispatch.executedBy', 'Run on {{host}}', {
                host: picked.detail || picked.hostId || ''
              })
            : translate(
                'localTasks.dispatch.chooseTarget',
                'Choose a workspace or repository with @'
              )}
        </span>
        <Button
          size="sm"
          disabled={
            busy ||
            !agent ||
            !text.trim() ||
            targets.length === 0 ||
            (targets.length > 1 && targets.some((target) => target.kind !== 'workspace')) ||
            !picked?.available ||
            !selectedProject
          }
          onClick={() => void submit(false)}
        >
          <ArrowUp className="size-4" />
          {translate('localTasks.dispatch.submit', 'Dispatch')}
        </Button>
      </div>
      {projectChoices.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {translate('localTasks.dispatch.project', 'Project')}
          {projectChoices.map((project) => (
            <Button
              key={project.id}
              size="xs"
              variant={selectedProject?.id === project.id ? 'secondary' : 'ghost'}
              onClick={() => {
                setProjectId(project.id)
                void localTasksClient
                  .setPreference('dispatchLastProject', project.id)
                  .catch(() => {})
              }}
            >
              {project.name}
            </Button>
          ))}
        </div>
      ) : null}
      {orphanRepo && !selectedProject ? (
        <div className="flex items-center justify-between gap-2 rounded border border-border p-2 text-xs">
          <span>
            {translate(
              'localTasks.dispatch.createProjectPrompt',
              'Create a project for {{repo}}?',
              { repo: orphanRepo.label }
            )}
          </span>
          <Button size="xs" disabled={busy} onClick={() => void submit(true)}>
            {translate('localTasks.dispatch.createProject', 'Create project and dispatch')}
          </Button>
        </div>
      ) : null}
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
