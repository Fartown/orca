import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import {
  sidebarProjectMemberKey,
  type SidebarProjectMerge
} from '../../../shared/sidebar-project-merge/sidebar-project-merges'
import { useSidebarProjectMergeStore } from './sidebar-project-merge-store'

export function SidebarProjectMergeEditor({
  merge,
  onClose,
  onSave
}: {
  merge: SidebarProjectMerge | null
  onClose: () => void
  onSave: (value: SidebarProjectMerge) => Promise<void>
}): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const targets = useAppStore((state) => state.sshTargetLabels)
  const settings = useAppStore((state) => state.settings)
  const saving = useSidebarProjectMergeStore((state) => state.saving)
  const error = useSidebarProjectMergeStore((state) => state.error)
  const [name, setName] = useState(merge?.name ?? '')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(
    () => new Set(merge?.members.map(sidebarProjectMemberKey))
  )
  const options = useMemo(() => {
    const state = {
      ...useAppStore.getState(),
      settings,
      runtimeEnvironments: environments,
      sshTargetLabels: targets
    }
    return repos.map((repo) => {
      const hostId = getRepoExecutionHostId(repo)
      const member = { hostId, repoId: repo.id }
      return {
        member,
        key: sidebarProjectMemberKey(member),
        name: repo.displayName,
        host: selectExecutionHostDisplayLabel(state, hostId),
        path: repo.path
      }
    })
  }, [repos, environments, targets, settings])
  const visible = options.filter((option) =>
    `${option.name} ${option.host} ${option.path}`.toLowerCase().includes(query.toLowerCase())
  )

  const submit = async () => {
    const byKey = new Map(merge?.members.map((member) => [sidebarProjectMemberKey(member), member]))
    for (const option of options) {
      byKey.set(option.key, option.member)
    }
    const members = [...byKey].filter(([key]) => selected.has(key)).map(([, member]) => member)
    try {
      await onSave({ id: merge?.id ?? createBrowserUuid(), name: name.trim(), members })
      onClose()
    } catch {
      // The persisted error remains visible in the dialog.
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>
              {translate('sidebarProjectMerge.editorTitle', 'Merge sidebar projects')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'sidebarProjectMerge.editorDescription',
                'Choose the projects to show under one title. Their workspaces keep running on their current computers.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sidebar-project-merge-name">
              {translate('sidebarProjectMerge.name', 'Project name')}
            </Label>
            <Input
              id="sidebar-project-merge-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={128}
              autoFocus
              disabled={saving}
            />
          </div>
          <Input
            aria-label={translate('sidebarProjectMerge.search', 'Search projects')}
            placeholder={translate('sidebarProjectMerge.search', 'Search projects')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={saving}
          />
          <div className="max-h-64 overflow-y-auto scrollbar-sleek space-y-1">
            {visible.map((option) => (
              <label
                key={option.key}
                className="flex items-start gap-3 rounded-md p-2 hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(option.key)}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (checked === true) {
                        next.add(option.key)
                      } else {
                        next.delete(option.key)
                      }
                      return next
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{option.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{option.host}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.path}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'sidebarProjectMerge.selected',
              '{{count}} projects selected. Select at least two.',
              { count: selected.size }
            )}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {translate('sidebarProjectMerge.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || selected.size < 2}>
              {translate('sidebarProjectMerge.save', 'Save merge')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
