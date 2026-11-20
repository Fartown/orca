import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { collectLocalTaskLabels, firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import { localTaskEndpointForHost, localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { useLocalTaskSourceTab } from '@/local-tasks/local-task-source-tab'
import {
  selectLocalTasksPartition,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import { localTaskEndpointOwnsHost } from '@/local-tasks/local-task-workspace-resolution'
import {
  localTaskLibraryWriteReason,
  useLocalTaskCreateWriteReason
} from '@/local-tasks/local-task-write-reason'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX,
  type LocalTaskPriority
} from '../../../../shared/local-tasks/local-task-model'
import {
  LocalTaskLabelsPicker,
  LocalTaskParentPicker,
  LocalTaskPrioritySelect,
  LocalTaskProjectSelect,
  LocalTaskStatusSelect
} from './LocalTaskFieldPickers'

const IS_MAC = navigator.userAgent.includes('Mac')

function CreateForm({
  initialTitle,
  close
}: {
  initialTitle: string
  close: () => void
}): React.JSX.Element {
  const tab = useLocalTaskSourceTab()
  const draft = tab?.draft
  const projects = useLocalTasksDomain((state) => state.projects)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const eligible = useMemo(
    () =>
      projects.filter(
        (project) => tab && localTaskEndpointOwnsHost(localTaskIdEndpoint(project.id), tab.hostId)
      ),
    [projects, tab]
  )
  const related = eligible.find((project) =>
    project.repos.some((repoId) => tab?.orcaProjectIds.includes(repoId))
  )
  const initialProjectId = draft?.newTask?.projectId ?? related?.id ?? eligible[0]?.id ?? null
  const [projectId, setProjectId] = useState(initialProjectId)
  const project = eligible.find((candidate) => candidate.id === projectId)
  const [statusId, setStatusId] = useState<string | null>(
    draft?.newTask?.statusId ??
      (firstStatusInCategory(project, 'unstarted') ?? project?.statuses[0])?.id ??
      null
  )
  const [title, setTitle] = useState(draft?.newTask?.title ?? initialTitle)
  const [description, setDescription] = useState(draft?.newTask?.description ?? '')
  const [priority, setPriority] = useState<LocalTaskPriority>(draft?.newTask?.priority ?? 0)
  const [labels, setLabels] = useState<string[]>(draft?.newTask?.labels ?? [])
  const [parentId, setParentId] = useState<string | null>(draft?.newTask?.parentId ?? null)
  const parents = useMemo(
    () => tasks.filter((task) => task.projectId === projectId),
    [tasks, projectId]
  )
  const suggestions = useMemo(() => collectLocalTaskLabels(tasks), [tasks])
  const reason = useLocalTaskCreateWriteReason(projectId)
  const ready = Boolean(draft && project && title.trim() && !reason)
  const stage = (): void => {
    if (!ready || !projectId) {
      return
    }
    draft?.stageCreate({
      projectId,
      title: title.trim(),
      description,
      statusId: statusId ?? undefined,
      priority,
      labels,
      parentId
    })
    close()
  }

  return (
    <DialogContent
      aria-describedby={undefined}
      scrollable
      className="sm:max-w-xl"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          (IS_MAC ? event.metaKey : event.ctrlKey) &&
          !isImeCompositionKeyDown(event)
        ) {
          event.preventDefault()
          event.stopPropagation()
          stage()
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{translate('localTasks.sourceTab.newTask', 'New local task')}</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        {translate(
          'localTasks.sourceTab.createOnSave',
          'The task and workspace link are saved when you save workspace details.'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <LocalTaskProjectSelect
          projects={eligible}
          value={projectId}
          onChange={(next) => {
            const nextProject = eligible.find((candidate) => candidate.id === next)
            setProjectId(next)
            setStatusId(
              (firstStatusInCategory(nextProject, 'unstarted') ?? nextProject?.statuses[0])?.id ??
                null
            )
            setParentId(null)
          }}
        />
      </div>
      <Input
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
      <div className="flex flex-wrap gap-2">
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
      {reason ? (
        <p role="status" className="text-xs text-muted-foreground">
          {reason}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          {translate('localTasks.common.cancel', 'Cancel')}
        </Button>
        <Button type="button" size="sm" disabled={!ready} onClick={stage}>
          {translate('localTasks.sourceTab.stageTask', 'Use this task')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** Workspace details only: stage a task, leaving creation and linking to the outer Save. */
export function LocalTaskSourceCreateAction({
  query,
  disabled
}: {
  query: string
  disabled: boolean
}): React.JSX.Element | null {
  const tab = useLocalTaskSourceTab()
  const [open, setOpen] = useState(false)
  const partition = useLocalTasksDomain((state) =>
    tab ? selectLocalTasksPartition(state, localTaskEndpointForHost(tab.hostId)) : undefined
  )
  if (!tab?.draft) {
    return null
  }
  const reason = localTaskLibraryWriteReason(partition, tab.libraryLabel)
  const pending = tab.draft.newTask
  return (
    <div className="border-b border-border p-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        disabled={disabled || Boolean(reason) || tab.draft.createAttempted}
        title={reason ?? undefined}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        {pending
          ? translate('localTasks.sourceTab.editNewTask', 'New task draft: {{title}}', {
              title: pending.title
            })
          : translate('localTasks.sourceTab.newTask', 'New local task')}
      </Button>
      {tab.draft.createAttempted ? (
        <p className="px-2 text-xs text-muted-foreground">
          {tab.draft.createdTaskId
            ? translate(
                'localTasks.sourceTab.createdLinkPending',
                'Task created; workspace link pending. Save again to retry.'
              )
            : translate(
                'localTasks.sourceTab.creationRetryPending',
                'Creation outcome is unknown. Save again to retry this draft.'
              )}
        </p>
      ) : null}
      {reason ? <p className="px-2 text-xs text-muted-foreground">{reason}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? <CreateForm initialTitle={query.trim()} close={() => setOpen(false)} /> : null}
      </Dialog>
    </div>
  )
}
