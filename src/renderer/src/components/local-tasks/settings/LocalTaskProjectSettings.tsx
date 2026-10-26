import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { useAppStore } from '@/store'
import {
  LOCAL_TASK_PROJECT_NAME_MAX,
  normalizeLocalTaskPrefix
} from '../../../../../shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'
import { describeLocalTaskFailure } from '@/local-tasks/local-task-failure-copy'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'

function Field({
  label,
  help,
  children
}: {
  label: string
  help?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )
}

function RemoveProjectDialog({
  project,
  open,
  onOpenChange
}: {
  project: LocalTaskProject
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const taskCount = useLocalTasksDomain(
    (state) => state.tasks.filter((task) => task.projectId === project.id).length
  )
  const [busy, setBusy] = useState(false)
  const remove = async (): Promise<void> => {
    setBusy(true)
    const result = await runLocalTaskWrite(() => localTasksClient.removeProject(project.id))
    setBusy(false)
    if (result) {
      onOpenChange(false)
      toast.success(
        translate('localTasks.settings.projectRemoved', 'Deleted {{name}}', { name: project.name })
      )
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>
            {translate('localTasks.settings.removeTitle', 'Delete {{name}}?', {
              name: project.name
            })}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'localTasks.settings.removeDescription',
              'Its tasks ({{count}}) are deleted with it. The Orca project, its workspaces and sessions are not touched.',
              { count: taskCount }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('localTasks.common.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {translate('localTasks.settings.removeConfirm', 'Delete project')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Name, prefix (earlier prefixes stay as aliases) and delete for one task project. */
export function LocalTaskProjectSettings({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  const orcaProjectName = useAppStore(
    (state) =>
      state.projects.find((candidate) => candidate.id === project.orcaProjectId)?.displayName
  )
  const [name, setName] = useState(project.name)
  const [prefix, setPrefix] = useState(project.prefix)
  const [prefixError, setPrefixError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const saveName = (): void => {
    const next = name.trim()
    if (!next || next === project.name) {
      setName(project.name)
      return
    }
    void runLocalTaskWrite(() =>
      localTasksClient.updateProject({
        projectId: project.id,
        expectedRevision: project.revision,
        name: next
      })
    )
  }
  const savePrefix = async (): Promise<void> => {
    const next = normalizeLocalTaskPrefix(prefix)
    if (!next) {
      setPrefixError(describeLocalTaskFailure({ ok: false, code: 'prefix_invalid' }))
      return
    }
    try {
      const result = await localTasksClient.updateProject({
        projectId: project.id,
        expectedRevision: project.revision,
        prefix: next
      })
      setPrefixError(result.ok ? null : describeLocalTaskFailure(result))
    } catch (error) {
      setPrefixError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <Field label={translate('localTasks.settings.name', 'Name')}>
        <Input
          value={name}
          disabled={!writable}
          maxLength={LOCAL_TASK_PROJECT_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isImeCompositionKeyDown(event)) {
              event.currentTarget.blur()
            }
          }}
        />
      </Field>
      <Field
        label={translate('localTasks.settings.orcaProject', 'Orca project')}
        help={translate(
          'localTasks.settings.orcaProjectHelp',
          'One Orca project has at most one task project. It works the same for local and SSH projects.'
        )}
      >
        <p className="text-sm text-foreground">
          {orcaProjectName ??
            translate('localTasks.settings.orcaProjectMissing', 'Not in this Orca profile')}
        </p>
      </Field>
      <Field
        label={translate('localTasks.settings.prefix', 'Ref prefix')}
        help={translate(
          'localTasks.settings.prefixHelp',
          'Changing it keeps the old prefix as an alias: old refs still search and open, and no other project can take it.'
        )}
      >
        <div className="flex items-center gap-2">
          <Input
            value={prefix}
            disabled={!writable}
            maxLength={10}
            onChange={(event) => {
              setPrefix(event.target.value.toUpperCase())
              setPrefixError(null)
            }}
            aria-invalid={prefixError !== null || undefined}
            className="w-32"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!writable || prefix === project.prefix}
            onClick={() => void savePrefix()}
          >
            {translate('localTasks.settings.savePrefix', 'Change prefix')}
          </Button>
        </div>
        {prefixError ? <p className="text-xs text-destructive">{prefixError}</p> : null}
        {project.aliases.length > 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            {translate('localTasks.settings.aliases', 'Aliases: {{aliases}}', {
              aliases: project.aliases.join(', ')
            })}
          </p>
        ) : null}
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.settings.removeHint',
            'Deleting the project deletes its tasks. Workspaces and sessions stay.'
          )}
        </p>
        <Button
          variant="destructive"
          size="sm"
          disabled={!writable}
          onClick={() => setRemoving(true)}
        >
          <Trash2 className="size-3.5" />
          {translate('localTasks.settings.removeProject', 'Delete project…')}
        </Button>
      </div>
      <RemoveProjectDialog project={project} open={removing} onOpenChange={setRemoving} />
    </section>
  )
}
