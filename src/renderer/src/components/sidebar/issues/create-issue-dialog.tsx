import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { IssueRouteExecutionHostId } from '../../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { useSidebarHostScopeOptions } from '../use-sidebar-host-scope-options'

export function CreateIssueDialog({
  open,
  onOpenChange,
  parentId,
  lockedRoute,
  onCreated
}: {
  open: boolean
  onOpenChange(open: boolean): void
  parentId?: string | null
  lockedRoute?: IssueRouteExecutionHostId
  onCreated?: () => void
}): React.JSX.Element {
  const { hostOptions } = useSidebarHostScopeOptions()
  const [route, setRoute] = useState<IssueRouteExecutionHostId>('local')
  const routeStatus = useIssueDomainStore(
    (state) => state.partitionsByRouteExecutionHostId[route]?.status ?? 'loading'
  )
  const [kind, setKind] = useState<'local' | 'external'>('local')
  const [title, setTitle] = useState('')
  const [provider, setProvider] = useState('github')
  const [identifier, setIdentifier] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setRoute(lockedRoute ?? hostOptions[0]?.id ?? 'local')
  }, [hostOptions, lockedRoute, open])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return
    }
    setPending(true)
    try {
      await IssueRuntimeClient.forRoute(route).mutate('issues.create', {
        mutationId: crypto.randomUUID(),
        source:
          kind === 'local'
            ? { kind: 'local', title: trimmedTitle }
            : {
                kind: 'external',
                provider,
                identifier: identifier.trim(),
                url: url.trim(),
                titleSnapshot: trimmedTitle
              },
        note: note || null,
        parentId: parentId ?? null
      })
      issueDomainStore.getState().setRouteStatus(route, 'loading')
      onCreated?.()
      onOpenChange(false)
      setTitle('')
      setIdentifier('')
      setUrl('')
      setNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const routeAllowsMutation = routeStatus === 'ready' || routeStatus === 'degraded'
  const valid =
    routeAllowsMutation &&
    title.trim().length > 0 &&
    (kind === 'local' || (identifier.trim().length > 0 && url.trim().length > 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{parentId ? 'Create child Issue' : 'Create Issue'}</DialogTitle>
            <DialogDescription>
              Create local work or record an external reference. Orca does not update the provider.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="issue-host">Execution host</Label>
              <Select
                value={route}
                disabled={Boolean(lockedRoute)}
                onValueChange={(value) => setRoute(value as IssueRouteExecutionHostId)}
              >
                <SelectTrigger id="issue-host" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hostOptions.map((host) => (
                    <SelectItem key={host.id} value={host.id}>
                      {host.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {routeStatus === 'degraded' ? (
                <p className="text-xs text-muted-foreground">
                  Hook evidence is unavailable. Issue CRUD and explicit launches remain available.
                </p>
              ) : routeStatus === 'unsupported' ? (
                <p className="text-xs text-destructive">
                  This host version does not support Issues.
                </p>
              ) : routeStatus === 'unavailable' ? (
                <p className="text-xs text-destructive">Issue storage is unavailable.</p>
              ) : routeStatus === 'offline' ? (
                <p className="text-xs text-destructive">This host is offline.</p>
              ) : routeAllowsMutation ? null : (
                <p className="text-xs text-muted-foreground">Checking Issue availability…</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-kind">Source</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                <SelectTrigger id="issue-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Issue</SelectItem>
                  <SelectItem value="external">External reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === 'external' ? (
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger aria-label="Provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['github', 'gitlab', 'linear', 'jira', 'other'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="External identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="#123"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="issue-title">Title</Label>
              <Input
                id="issue-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            {kind === 'external' ? (
              <div className="space-y-2">
                <Label htmlFor="issue-url">URL</Label>
                <Input
                  id="issue-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="issue-note">Note</Label>
              <Textarea
                id="issue-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || pending} className="w-24">
              {pending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
