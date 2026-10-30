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
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import {
  LOCAL_TASK_PROJECT_NAME_MAX,
  normalizeLocalTaskPrefix
} from '../../../../../shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'
import { describeLocalTaskFailure } from '@/local-tasks/local-task-failure-copy'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { localTasksSync } from '@/local-tasks/local-tasks-sync'
import { useRevisionedFieldDraft, type LocalTaskFieldDraft } from '../use-local-task-field-draft'
import type { LocalTasksProjectsUpdateInput } from '../../../../../shared/local-tasks/local-tasks-rpc-params'
import { LocalTaskProjectRules } from './LocalTaskProjectRules'
import { LocalTaskProjectRepos } from './LocalTaskProjectRepos'

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

type ProjectPatch = Pick<LocalTasksProjectsUpdateInput, 'name' | 'prefix'>

function ProjectFieldConflict({
  field
}: {
  field: LocalTaskFieldDraft<string>
}): React.JSX.Element | null {
  if (!field.conflict) {
    return null
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
      {translate(
        'localTasks.detail.conflict',
        'Changed on another device while you were editing. Your text is kept here.'
      )}
      <Button
        variant="outline"
        size="xs"
        disabled={field.saving}
        onClick={() => void field.overwrite()}
      >
        {translate('localTasks.detail.conflictOverwrite', 'Overwrite with mine')}
      </Button>
      <Button variant="ghost" size="xs" disabled={field.saving} onClick={field.discard}>
        {translate('localTasks.detail.conflictDiscard', 'Discard mine')}
      </Button>
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
  const [nameError, setNameError] = useState<string | null>(null)
  const [prefixError, setPrefixError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const saveProject = async (_id: string, patch: ProjectPatch, expectedRevision: number) => {
    try {
      const result = await localTasksClient.updateProject({
        projectId: project.id,
        expectedRevision,
        ...patch
      })
      if (result.ok) {
        localTasksDomainStore.getState().upsertProject(result.project)
        return 'saved' as const
      }
      if (result.code === 'stale') {
        return 'stale' as const
      }
      const error = describeLocalTaskFailure(result)
      if (patch.name !== undefined) {
        setNameError(error)
      }
      if (patch.prefix !== undefined) {
        setPrefixError(error)
      }
      return 'failed' as const
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (patch.name !== undefined) {
        setNameError(message)
      }
      if (patch.prefix !== undefined) {
        setPrefixError(message)
      }
      return 'failed' as const
    }
  }
  const latestProject = (id: string): LocalTaskProject | undefined =>
    localTasksDomainStore.getState().projects.find((candidate) => candidate.id === id)
  const refreshProjects = (): Promise<void> =>
    localTasksSync.refresh(['projects'], localTaskIdEndpoint(project.id))
  const name = useRevisionedFieldDraft({
    task: project,
    stored: project.name,
    read: (candidate: LocalTaskProject) => candidate.name,
    same: (a: string, b: string) => a === b,
    toPatch: (value: string): ProjectPatch => ({ name: value.trim() }),
    save: saveProject,
    latest: latestProject,
    refresh: refreshProjects
  })
  const prefix = useRevisionedFieldDraft({
    task: project,
    stored: project.prefix,
    read: (candidate: LocalTaskProject) => candidate.prefix,
    same: (a: string, b: string) => a === b,
    toPatch: (value: string): ProjectPatch => ({ prefix: normalizeLocalTaskPrefix(value) ?? '' }),
    save: saveProject,
    latest: latestProject,
    refresh: refreshProjects
  })

  const saveName = (): void => {
    const next = name.value.trim()
    if (!next || next === project.name) {
      name.discard()
      return
    }
    void name.commit()
  }
  const savePrefix = async (): Promise<void> => {
    const next = normalizeLocalTaskPrefix(prefix.value)
    if (!next) {
      setPrefixError(describeLocalTaskFailure({ ok: false, code: 'prefix_invalid' }))
      return
    }
    setPrefixError(null)
    await prefix.commit()
  }

  return (
    <section className="flex flex-col gap-5">
      <Field label={translate('localTasks.settings.name', 'Name')}>
        <Input
          value={name.value}
          disabled={!writable}
          maxLength={LOCAL_TASK_PROJECT_NAME_MAX}
          onChange={(event) => {
            name.edit(event.target.value)
            setNameError(null)
          }}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isImeCompositionKeyDown(event)) {
              event.currentTarget.blur()
            }
          }}
        />
        {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
        <ProjectFieldConflict field={name} />
      </Field>
      <LocalTaskProjectRepos project={project} writable={writable} />
      <Field
        label={translate('localTasks.settings.prefix', 'Ref prefix')}
        help={translate(
          'localTasks.settings.prefixHelp',
          'Changing it keeps the old prefix as an alias: old refs still search and open, and no other project can take it.'
        )}
      >
        <div className="flex items-center gap-2">
          <Input
            value={prefix.value}
            disabled={!writable}
            maxLength={10}
            onChange={(event) => {
              prefix.edit(event.target.value.toUpperCase())
              setPrefixError(null)
            }}
            aria-invalid={prefixError !== null || undefined}
            className="w-32"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!writable || prefix.value === project.prefix || prefix.saving}
            onClick={() => void savePrefix()}
          >
            {translate('localTasks.settings.savePrefix', 'Change prefix')}
          </Button>
        </div>
        {prefixError ? <p className="text-xs text-destructive">{prefixError}</p> : null}
        <ProjectFieldConflict field={prefix} />
        {project.aliases.length > 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            {translate('localTasks.settings.aliases', 'Aliases: {{aliases}}', {
              aliases: project.aliases.join(', ')
            })}
          </p>
        ) : null}
      </Field>
      <LocalTaskProjectRules project={project} writable={writable} />
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.settings.removeHint',
            'Deleting the project deletes its tasks. Workspaces and sessions stay.'
          )}
        </p>
        <Button
          variant="destructive-chip"
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
