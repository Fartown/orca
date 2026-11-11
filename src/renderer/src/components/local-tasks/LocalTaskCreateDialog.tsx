import { useMemo, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX,
  type LocalTaskPriority
} from '../../../../shared/local-tasks/local-task-model'
import { localTaskParentCandidates } from '../../../../shared/local-tasks/local-task-hierarchy'
import { collectLocalTaskLabels, firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import {
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskCreateDefaults
} from '@/local-tasks/local-task-page-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { writableLocalTaskProjects } from '@/local-tasks/local-task-write-access'
import { useLocalTaskCreateWriteReason } from '@/local-tasks/local-task-write-reason'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { orcaProjectIdsForWorktree } from '@/local-tasks/local-task-workspace-resolution'
import { runLocalTaskStart, useLocalTaskStartState } from '@/local-tasks/local-task-work-actions'
import { findLocalTaskEffectiveWorkspace } from '@/local-tasks/local-task-link-selectors'
import {
  localTaskCreateChoiceFitsProject,
  type LocalTaskCreateWorkspaceChoice
} from '@/local-tasks/local-task-create-workspace-choices'
import {
  kickOffCreatedLocalTask,
  linkCreatedLocalTaskToSession,
  localTaskSourceSessionName
} from '@/local-tasks/local-task-create-kickoff'
import {
  useLocalTaskCreateWhere,
  type LocalTaskCreateWhereChoice
} from '@/local-tasks/use-local-task-create-where'
import {
  LocalTaskLabelsPicker,
  LocalTaskParentPicker,
  LocalTaskPrioritySelect,
  LocalTaskProjectSelect,
  LocalTaskStatusSelect
} from './LocalTaskFieldPickers'
import {
  LocalTaskCreateSectionHeading,
  LocalTaskCreateWhereSection
} from './LocalTaskCreateWhereSection'
import type { LocalTaskListModel } from './use-local-task-list-model'
import { useLocalTaskEscapeLayer } from './use-local-task-page-keys'

const IS_MAC = navigator.userAgent.includes('Mac')

function CreateBody({
  defaults,
  model
}: {
  defaults: LocalTaskCreateDefaults
  model: LocalTaskListModel
}): React.JSX.Element {
  const { tasks } = model
  const source = defaults.source
  // Why writable only: each project's library takes its own writes; a read-only one cannot.
  const writableIds = useLocalTasksDomain((state) =>
    writableLocalTaskProjects(state, model.projects)
      .map((project) => project.id)
      .join('\n')
  )
  const projects = useMemo(() => {
    const ids = new Set(writableIds.split('\n'))
    return model.projects.filter((project) => ids.has(project.id))
  }, [model.projects, writableIds])
  const [projectId, setProjectId] = useState(
    projects.some((candidate) => candidate.id === defaults.projectId)
      ? defaults.projectId
      : (projects.find(
          (project) =>
            source &&
            project.repos.some((id) =>
              orcaProjectIdsForWorktree(useAppStore.getState(), source.worktree).has(id)
            )
        )?.id ??
          projects[0]?.id ??
          null)
  )
  const project = projects.find((candidate) => candidate.id === projectId)
  const defaultStatusId = (firstStatusInCategory(project, 'unstarted') ?? project?.statuses[0])?.id
  const [statusId, setStatusId] = useState(defaults.statusId ?? defaultStatusId ?? null)
  const [title, setTitle] = useState(source?.title ?? '')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<LocalTaskPriority>(defaults.priority ?? 0)
  const [labels, setLabels] = useState<string[]>([])
  const [parentId, setParentId] = useState(defaults.parentId)
  const [keepCreating, setKeepCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const suggestions = useMemo(() => collectLocalTaskLabels(tasks), [tasks])
  const parents = useMemo(
    () => localTaskParentCandidates(null, projectId, tasks, model.index),
    [tasks, projectId, model.index]
  )
  const whereState = useLocalTaskCreateWhere({
    writableProjects: projects,
    projectId,
    sourceWorktreeId: source?.worktree.id ?? null
  })
  const { where, picked, usablePick, agent } = whereState
  const startState = useLocalTaskStartState(project, null)
  const writeReason = useLocalTaskCreateWriteReason(projectId ?? defaults.projectId)
  const record = source
    ? { session: localTaskSourceSessionName(source), workspace: source.worktree.displayName }
    : null

  const switchProject = (next: string): void => {
    const nextProject = projects.find((candidate) => candidate.id === next)
    setProjectId(next)
    setStatusId(
      (firstStatusInCategory(nextProject, 'unstarted') ?? nextProject?.statuses[0])?.id ?? null
    )
    setParentId(null)
  }

  // Why the project follows the pick: a library holds only its own hosts, and a workspace that
  // already belongs to a task takes the new task in as that task's subtask.
  const pick = (choice: LocalTaskCreateWorkspaceChoice): void => {
    whereState.setPickedKey(choice.key)
    const switching = choice.projectId !== null && choice.projectId !== projectId
    if (choice.projectId !== null && switching) {
      switchProject(choice.projectId)
    }
    if (choice.owner) {
      setParentId(choice.owner.id)
    } else if (!switching && picked?.owner && parentId === picked.owner.id) {
      setParentId(parents.some((task) => task.id === defaults.parentId) ? defaults.parentId : null)
    }
  }

  // Why: the owner's task is the parent only while its workspace is where the task works.
  const changeWhere = (next: LocalTaskCreateWhereChoice): void => {
    whereState.setWhere(next)
    if (!picked?.owner) {
      return
    }
    if (next === 'existing') {
      setParentId(picked.owner.id)
    } else if (parentId === picked.owner.id) {
      setParentId(parents.some((task) => task.id === defaults.parentId) ? defaults.parentId : null)
    }
  }

  const changeParent = (next: string | null): void => {
    setParentId(next)
    if (!picked?.owner || next === picked.owner.id) {
      return
    }
    const parent = next ? model.index.tasksById.get(next) : undefined
    const inherited = parent
      ? findLocalTaskEffectiveWorkspace(
          localTasksDomainStore.getState().links,
          parent,
          model.index.tasksById
        )
      : null
    // Why: a task under another parent no longer works in the owner's workspace.
    if (inherited?.taskId !== picked.owner.id) {
      whereState.setPickedKey(null)
    }
  }

  const whereReady = source
    ? true
    : where === 'existing'
      ? usablePick !== null
      : where === 'new'
        ? startState.mode === 'create' && startState.reason === null
        : true
  const canSubmit = Boolean(projectId && title.trim()) && !submitting && whereReady
  const keepOpen = keepCreating && where === 'later' && !source

  const submit = async (): Promise<void> => {
    if (!canSubmit || !projectId) {
      return
    }
    setSubmitting(true)
    const result = await runLocalTaskWrite(() =>
      localTasksClient.createTask({
        projectId,
        title: title.trim(),
        description,
        statusId: statusId ?? undefined,
        priority,
        labels,
        parentId
      })
    )
    setSubmitting(false)
    if (!result) {
      return
    }
    const task = result.task
    localTasksDomainStore.getState().upsertTasks([task], { created: true })
    toast.success(
      translate('localTasks.create.created', 'Created “{{title}}” · {{ref}}', {
        title: task.title,
        ref: task.ref
      })
    )
    if (keepOpen) {
      setTitle('')
      setDescription('')
      titleRef.current?.focus()
      return
    }
    localTaskPageStore.getState().openDetail(task.id)
    localTaskPageStore.getState().closeCreate()
    if (source) {
      await linkCreatedLocalTaskToSession(task, source)
    } else if (where === 'new' && project) {
      runLocalTaskStart(task, project, null)
    } else if (where === 'existing' && usablePick) {
      const { firstLine, delivery } = whereState
      void kickOffCreatedLocalTask(task, { choice: usablePick, agent, firstLine, delivery })
    }
  }

  const primaryLabel =
    !source && where === 'existing' && agent
      ? translate('localTasks.createFlow.createAndStart', 'Create and start')
      : !source && where === 'new'
        ? translate('localTasks.createFlow.createThenWorkspace', 'Create, then new workspace')
        : translate('localTasks.createFlow.create', 'Create')

  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          (IS_MAC ? event.metaKey : event.ctrlKey) &&
          !isImeCompositionKeyDown(event)
        ) {
          event.preventDefault()
          void submit()
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5 pr-8">
        <LocalTaskProjectSelect
          projects={projects}
          value={projectId}
          onChange={(next) => {
            if (next === projectId) {
              return
            }
            switchProject(next)
            if (picked && !localTaskCreateChoiceFitsProject(picked, next)) {
              whereState.setPickedKey(null)
            }
          }}
        />
        <DialogTitle className="shrink-0">
          <span className="block text-base">
            {record
              ? translate('localTasks.createFlow.recordTitle', 'Make task')
              : translate('localTasks.create.title', 'New task')}
          </span>
        </DialogTitle>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {record
            ? translate(
                'localTasks.createFlow.recordSubtitle',
                'Links the {{agent}} session ({{workspace}}) and its workspace',
                { agent: record.session, workspace: record.workspace }
              )
            : translate(
                'localTasks.createFlow.stepSubtitle',
                'Step 1 of 2: the task, then where to work'
              )}
        </span>
      </div>
      <section className="flex flex-col gap-2">
        <LocalTaskCreateSectionHeading step={1}>
          {translate('localTasks.createFlow.whatSection', 'What to do')}
        </LocalTaskCreateSectionHeading>
        <Input
          ref={titleRef}
          autoFocus
          value={title}
          maxLength={LOCAL_TASK_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={translate('localTasks.create.titlePlaceholder', 'Task title (required)')}
          aria-label={translate('localTasks.create.titleLabel', 'Title')}
        />
        <Textarea
          value={description}
          maxLength={LOCAL_TASK_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={translate(
            'localTasks.createFlow.descriptionPlaceholder',
            'Description (optional)'
          )}
          aria-label={translate('localTasks.create.descriptionLabel', 'Description')}
          className="min-h-16"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LocalTaskStatusSelect project={project} value={statusId} onChange={setStatusId} />
          <LocalTaskPrioritySelect value={priority} onChange={setPriority} />
          <LocalTaskLabelsPicker
            value={labels}
            suggestions={suggestions}
            onToggle={(label) =>
              setLabels((current) =>
                current.includes(label)
                  ? current.filter((item) => item !== label)
                  : [...current, label]
              )
            }
          />
          <LocalTaskParentPicker candidates={parents} value={parentId} onChange={changeParent} />
        </div>
      </section>
      <LocalTaskCreateWhereSection
        state={{ ...whereState, setWhere: changeWhere }}
        start={startState}
        onPick={pick}
        record={record}
      />
      {writeReason ? (
        <p role="status" className="text-xs text-muted-foreground">
          {writeReason}
        </p>
      ) : null}
      <div className="flex min-w-0 items-center gap-3 border-t border-border/60 pt-3">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {!source && where === 'new'
              ? translate(
                  'localTasks.createFlow.nextNote',
                  'Opens the new workspace dialog after creating the task'
                )
              : translate(
                  'localTasks.createFlow.staysNote',
                  'Stays on the task view after creating'
                )}
          </span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {!source && where === 'later' ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={keepCreating} onCheckedChange={setKeepCreating} />
              {translate('localTasks.create.keepCreating', 'Create another')}
            </label>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => localTaskPageStore.getState().closeCreate()}
          >
            {translate('localTasks.common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {primaryLabel}
            <ShortcutKeyCombo
              keys={[IS_MAC ? '⌘' : 'Ctrl', '↵']}
              keyCapClassName="min-w-4 border-primary-foreground/30 bg-transparent px-1 py-0 text-3xs text-primary-foreground"
              separatorClassName="text-3xs text-primary-foreground"
            />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * New task (REQ-027): what to do, then where to work. An existing workspace starts the session
 * here; a new one hands over to Orca's own new-workspace dialog with this task preselected.
 */
export function LocalTaskCreateDialog({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const create = useLocalTaskPage((state) => state.create)
  const close = (): void => localTaskPageStore.getState().closeCreate()
  useLocalTaskEscapeLayer('dialog', create.open, close)
  return (
    <Dialog
      open={create.open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent
        data-local-task-overlay=""
        aria-describedby={undefined}
        scrollable
        className="sm:max-w-3xl"
      >
        {create.open ? <CreateBody defaults={create.defaults} model={model} /> : null}
      </DialogContent>
    </Dialog>
  )
}
