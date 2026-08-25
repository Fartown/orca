import { useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { IssueRouteExecutionHostId, IssueSummary } from '../../../../shared/issues/types'
import { ISSUE_MAX_DEPTH } from '../../../../shared/issues/constants'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'

export function IssueReparentDialog({
  route,
  issue,
  open,
  onOpenChange,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  issue: IssueSummary
  open: boolean
  onOpenChange(open: boolean): void
  onChanged(): void
}): React.JSX.Element {
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const [parentId, setParentId] = useState(issue.parentId ?? 'root')
  const [pending, setPending] = useState(false)
  const candidates = useMemo(
    () => legalReparentTargets(issue, Object.values(partition?.issuesById ?? {})),
    [issue, partition?.issuesById]
  )

  const submit = async (): Promise<void> => {
    if (partition?.treeRevision == null) {
      return
    }
    setPending(true)
    try {
      await IssueRuntimeClient.forRoute(route).mutate('issues.reparent', {
        mutationId: crypto.randomUUID(),
        issueId: issue.id,
        parentId: parentId === 'root' ? null : parentId,
        index: 0,
        expectedTreeRevision: partition.treeRevision
      })
      onOpenChange(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move Issue</DialogTitle>
          <DialogDescription>Only legal parents on this authority are shown.</DialogDescription>
        </DialogHeader>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="root">Root</SelectItem>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.source.kind === 'local'
                  ? candidate.localTitle
                  : candidate.source.titleSnapshot}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function legalReparentTargets(
  issue: IssueSummary,
  issues: readonly IssueSummary[]
): IssueSummary[] {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const candidate of issues) {
      if (
        candidate.parentId &&
        (candidate.parentId === issue.id || descendants.has(candidate.parentId)) &&
        !descendants.has(candidate.id)
      ) {
        descendants.add(candidate.id)
        changed = true
      }
    }
  }
  return issues.filter(
    (candidate) =>
      candidate.id !== issue.id &&
      !descendants.has(candidate.id) &&
      candidate.hostPartitionKey === issue.hostPartitionKey &&
      candidate.executionHostId === issue.executionHostId &&
      ancestorDepth(candidate, issues) + subtreeHeight(issue, issues) <= ISSUE_MAX_DEPTH
  )
}

function ancestorDepth(issue: IssueSummary, issues: readonly IssueSummary[]): number {
  const byId = new Map(issues.map((candidate) => [candidate.id, candidate]))
  let depth = 1
  let current = issue
  const visited = new Set<string>()
  while (current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    depth += 1
    const parent = byId.get(current.parentId)
    if (!parent) {
      break
    }
    current = parent
  }
  return depth
}

function subtreeHeight(issue: IssueSummary, issues: readonly IssueSummary[]): number {
  const children = issues.filter((candidate) => candidate.parentId === issue.id)
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(child, issues)))
}
