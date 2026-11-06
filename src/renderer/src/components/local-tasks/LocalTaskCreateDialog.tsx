import { useAppStore } from '@/store'
import { linkLocalTaskWorkspace } from '@/local-tasks/local-task-workspace-linking'
import { recordLocalTaskSession, chatSessionIds } from '@/local-tasks/local-task-session-recording'
import {
  localTaskWorktreeHostId,
  orcaProjectIdsForWorktree
} from '@/local-tasks/local-task-workspace-resolution'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { runLocalTaskStart } from '@/local-tasks/local-task-work-actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { collectLocalTaskLabels, firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import {
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskCreateDefaults
} from '@/local-tasks/local-task-page-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskParentCandidates } from '../../../../shared/local-tasks/local-task-hierarchy'
import { writableLocalTaskProjects } from '@/local-tasks/local-task-write-access'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import {
  LocalTaskLabelsPicker,
  LocalTaskParentPicker,
  LocalTaskPrioritySelect,
  LocalTaskProjectSelect,
  LocalTaskStatusSelect
} from './LocalTaskFieldPickers'
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
            defaults.source &&
            project.repos.some((id) =>
              orcaProjectIdsForWorktree(useAppStore.getState(), defaults.source!.worktree).has(id)
            )
        )?.id ??
          projects[0]?.id ??
          null)
  )
  const project = projects.find((candidate) => candidate.id === projectId)
  const defaultStatusId = (firstStatusInCategory(project, 'unstarted') ?? project?.statuses[0])?.id
  const [statusId, setStatusId] = useState(defaults.statusId ?? defaultStatusId ?? null)
  const [title, setTitle] = useState(defaults.source?.title ?? '')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<LocalTaskPriority>(defaults.priority ?? 0)
  const [labels, setLabels] = useState<string[]>([])
  const [parentId, setParentId] = useState(defaults.parentId)
  const [keepCreating, setKeepCreating] = useState(false)
  const [workspaceAction, setWorkspaceAction] = useState('later')
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const suggestions = useMemo(() => collectLocalTaskLabels(tasks), [tasks])
  const parents = useMemo(
    () => localTaskParentCandidates(null, projectId, tasks, model.index),
    [tasks, projectId, model.index]
  )

  const submit = async (): Promise<void> => {
    if (!projectId || !title.trim() || submitting) {
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
    localTasksDomainStore.getState().upsertTasks([result.task], { created: true })
    toast.success(
      translate('localTasks.create.created', 'Created “{{title}}” · {{ref}}', {
        title: result.task.title,
        ref: result.task.ref
      })
    )
    if (keepCreating) {
      setTitle('')
      setDescription('')
      titleRef.current?.focus()
      return
    }
    localTaskPageStore.getState().openDetail(result.task.id)
    localTaskPageStore.getState().closeCreate()
    if (defaults.source) {
      const { worktree, paneKey, agent, sessionId, tabId } = defaults.source
      const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
        taskId: result.task.id,
        worktree,
        linkedVia: 'manual'
      })
      const pane = parsePaneKey(paneKey)
      if (linked && (pane || sessionId)) {
        await recordLocalTaskSession(
          {
            taskId: result.task.id,
            worktreeId: worktree.id,
            instanceId: worktree.instanceId ?? null,
            hostId: localTaskWorktreeHostId(useAppStore.getState(), worktree),
            agent: isTuiAgent(agent) ? agent : null,
            linkedVia: 'manual'
          },
          sessionId
            ? chatSessionIds(tabId ?? null, sessionId)
            : { surface: 'terminal', tabId: pane!.tabId, paneKey }
        )
      }
      return
    }
    if (workspaceAction === 'new' && project) {
      runLocalTaskStart(result.task, project, null)
    }
    if (workspaceAction === 'existing') {
      localTaskLinkDialogStore.getState().open({ kind: 'pick-workspace', taskId: result.task.id })
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
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
      <div className="flex items-center gap-2 pr-8">
        <LocalTaskProjectSelect
          projects={projects}
          value={projectId}
          onChange={(next) => {
            const nextProject = projects.find((candidate) => candidate.id === next)
            setProjectId(next)
            setStatusId(
              (firstStatusInCategory(nextProject, 'unstarted') ?? nextProject?.statuses[0])?.id ??
                null
            )
            setParentId(null)
          }}
        />
        <DialogTitle>{translate('localTasks.create.title', 'New task')}</DialogTitle>
      </div>
      <Input
        ref={titleRef}
        autoFocus
        value={title}
        maxLength={LOCAL_TASK_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={translate('localTasks.create.titlePlaceholder', 'Task title')}
        aria-label={translate('localTasks.create.titleLabel', 'Title')}
      />
      <Textarea
        value={description}
        maxLength={LOCAL_TASK_DESCRIPTION_MAX}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={translate('localTasks.create.descriptionPlaceholder', 'Add a description…')}
        aria-label={translate('localTasks.create.descriptionLabel', 'Description')}
        className="min-h-24"
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
        <LocalTaskParentPicker candidates={parents} value={parentId} onChange={setParentId} />
      </div>
      {defaults.source ? null : (
        <Select value={workspaceAction} onValueChange={setWorkspaceAction}>
          <SelectTrigger aria-label={translate('localTasks.create.workspace', 'Workspace')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="later">
              {translate('localTasks.create.workspaceLater', 'Choose workspace later')}
            </SelectItem>
            <SelectItem value="existing">
              {translate('localTasks.create.workspaceExisting', 'Use existing workspace')}
            </SelectItem>
            <SelectItem value="new">
              {translate('localTasks.create.workspaceNew', 'Create a workspace next')}
            </SelectItem>
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center gap-3 border-t border-border/60 pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={keepCreating} onCheckedChange={setKeepCreating} />
          {translate('localTasks.create.keepCreating', 'Create another')}
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => localTaskPageStore.getState().closeCreate()}
        >
          {translate('localTasks.common.cancel', 'Cancel')}
        </Button>
        <Button
          size="sm"
          disabled={!title.trim() || !projectId || submitting}
          onClick={() => void submit()}
        >
          {translate('localTasks.create.submit', 'Create task')}
          <ShortcutKeyCombo
            keys={[IS_MAC ? '⌘' : 'Ctrl', '↵']}
            keyCapClassName="min-w-4 border-primary-foreground/30 bg-transparent px-1 py-0 text-3xs text-primary-foreground"
            separatorClassName="text-3xs text-primary-foreground"
          />
        </Button>
      </div>
    </div>
  )
}

/** New task (REQ-004): project, task details and the next workspace action. */
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
        className="sm:max-w-2xl"
      >
        {create.open ? <CreateBody defaults={create.defaults} model={model} /> : null}
      </DialogContent>
    </Dialog>
  )
}
