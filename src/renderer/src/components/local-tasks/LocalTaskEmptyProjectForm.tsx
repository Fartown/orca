import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { useAppStore } from '@/store'
import {
  LOCAL_TASK_PROJECT_NAME_MAX,
  normalizeLocalTaskPrefix
} from '../../../../shared/local-tasks/local-task-model'
import {
  suggestLocalTaskPrefix,
  takenLocalTaskPrefixes
} from '../../../../shared/local-tasks/local-task-prefix-suggestion'
import { describeLocalTaskFailure } from '@/local-tasks/local-task-failure-copy'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { defaultLocalTaskEndpoint } from '@/local-tasks/local-task-project-repos'
import { localTaskDefaultStatusNames } from '@/local-tasks/local-task-vocabulary-copy'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import {
  localTasksDomainStore,
  useLocalTasksDomain,
  useWritableLocalTaskEndpoints
} from '@/local-tasks/local-tasks-domain-store'

/**
 * A project with no repos (REQ-001), for tasks only; repos can be linked later in settings. It is
 * kept by the Orca the user picks, among those in contact whose library takes writes.
 */
export function LocalTaskEmptyProjectForm({ onDone }: { onDone?: () => void }): React.JSX.Element {
  const writable = useWritableLocalTaskEndpoints()
  const hostScope = useAppStore((state) => state.workspaceHostScope)
  const hostLabels = useAppStore(
    useShallow((state) =>
      writable.length > 1
        ? writable.map((endpoint) => selectExecutionHostDisplayLabel(state, endpoint))
        : []
    )
  )
  const taskProjects = useLocalTasksDomain((state) => state.projects)
  const [picked, setPicked] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint =
    writable.find((candidate) => candidate === picked) ??
    defaultLocalTaskEndpoint(hostScope, writable)
  // Why one library's prefixes: each Orca numbers its own tasks, so prefixes never collide across.
  const suggested = name.trim()
    ? suggestLocalTaskPrefix(
        name,
        takenLocalTaskPrefixes(
          taskProjects.filter((project) => localTaskIdEndpoint(project.id) === endpoint)
        )
      )
    : ''
  const shownPrefix = prefix ?? suggested

  const create = async (): Promise<void> => {
    const trimmed = name.trim()
    const normalized = normalizeLocalTaskPrefix(shownPrefix)
    if (!endpoint || !trimmed || busy) {
      return
    }
    if (!normalized) {
      setError(describeLocalTaskFailure({ ok: false, code: 'prefix_invalid' }))
      return
    }
    setBusy(true)
    try {
      const result = await localTasksClient.createProject(endpoint, {
        name: trimmed,
        prefix: normalized,
        statusNames: localTaskDefaultStatusNames()
      })
      if (result.ok) {
        localTasksDomainStore.getState().upsertProject(result.project)
        setName('')
        setPrefix(null)
        setError(null)
        onDone?.()
      } else {
        setError(describeLocalTaskFailure(result))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="local-task-empty-project-name">
            {translate('localTasks.projects.emptyName', 'Project name')}
          </Label>
          <Input
            id="local-task-empty-project-name"
            value={name}
            disabled={!endpoint || busy}
            maxLength={LOCAL_TASK_PROJECT_NAME_MAX}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isImeCompositionKeyDown(event)) {
                event.preventDefault()
              }
            }}
            placeholder={translate('localTasks.projects.emptyNamePlaceholder', 'e.g. Research')}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-task-empty-project-prefix">
            {translate('localTasks.settings.prefix', 'Ref prefix')}
          </Label>
          <Input
            id="local-task-empty-project-prefix"
            value={shownPrefix}
            disabled={!endpoint || busy}
            maxLength={10}
            onChange={(event) => {
              setPrefix(event.target.value.toUpperCase())
              setError(null)
            }}
            aria-invalid={error !== null || undefined}
            className="h-8 w-24"
          />
        </div>
        {writable.length > 1 && endpoint ? (
          <div className="flex flex-col gap-1.5">
            <Label>{translate('localTasks.projects.emptyHost', 'Kept on')}</Label>
            <Select value={endpoint} onValueChange={setPicked} disabled={busy}>
              <SelectTrigger size="sm" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {writable.map((candidate, at) => (
                  <SelectItem key={candidate} value={candidate}>
                    {hostLabels[at] ?? candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button type="submit" size="sm" disabled={!endpoint || !name.trim() || busy}>
          {translate('localTasks.projects.createEmpty', 'Create empty project')}
        </Button>
      </div>
      {!endpoint ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.projects.noWritableLibrary',
            'No Orca in contact can take a new project right now.'
          )}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  )
}
