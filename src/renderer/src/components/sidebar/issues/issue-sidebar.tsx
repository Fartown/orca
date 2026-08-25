import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import type { IssuePartitionState } from '@/issues/issues-domain-store'
import type { IssueListFilter, IssueRouteExecutionHostId } from '../../../../../shared/issues/types'
import { useSidebarHostScopeOptions } from '../use-sidebar-host-scope-options'
import { buildIssueRows } from './build-issue-rows'
import { IssueVirtualRow } from './issue-virtual-row'

export function IssueSidebar(): React.JSX.Element {
  const { hostOptions } = useSidebarHostScopeOptions()
  const partitions = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId)
  const filter = useIssueDomainStore((state) => state.filter)
  const searchQuery = useIssueDomainStore((state) => state.searchQuery)
  const collapsedIssueIds = useIssueDomainStore((state) => state.collapsedIssueIds)
  const setFilter = useIssueDomainStore((state) => state.setFilter)
  const setSearchQuery = useIssueDomainStore((state) => state.setSearchQuery)
  const [selectedHost, setSelectedHost] = useState<'all' | IssueRouteExecutionHostId>('all')
  const visibleHosts = useMemo(
    () =>
      selectedHost === 'all' ? hostOptions : hostOptions.filter((host) => host.id === selectedHost),
    [hostOptions, selectedHost]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-worktree-sidebar-border px-2 py-2">
        <div className="flex items-center gap-1">
          {(
            [
              ['all', 'All'],
              ['needs-me', 'Needs me'],
              ['archived', 'Archived']
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="xs"
              className={filter === value ? 'bg-worktree-sidebar-accent text-foreground' : ''}
              onClick={() => setFilter(value as IssueListFilter)}
            >
              {label}
            </Button>
          ))}
          <Select
            value={selectedHost}
            onValueChange={(value) => setSelectedHost(value as typeof selectedHost)}
          >
            <SelectTrigger
              size="sm"
              className="ml-auto h-6 max-w-28 border-0 bg-transparent px-1.5 shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All hosts</SelectItem>
              {hostOptions.map((host) => (
                <SelectItem key={host.id} value={host.id}>
                  {host.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Filter titles"
          className="h-7 bg-input/50 text-xs shadow-none"
          aria-label="Filter Issues"
        />
      </div>
      <div className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {visibleHosts.map((host) => {
          const route = host.id as IssueRouteExecutionHostId
          const partition = partitions[route]
          return (
            <section key={host.id} aria-label={`${host.label} Issues`}>
              <div className="flex h-7 items-center gap-1.5 px-3 text-[11px] font-semibold text-muted-foreground">
                <Server className="size-3" />
                <span className="min-w-0 flex-1 truncate">
                  {host.label}
                  {partition?.authority?.profileLabel
                    ? ` · ${partition.authority.profileLabel}`
                    : ''}
                </span>
              </div>
              <IssueHostRows
                route={route}
                partition={partition}
                filter={filter}
                searchQuery={searchQuery}
                collapsedIssueIds={collapsedIssueIds}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}

function IssueHostRows({
  route,
  partition,
  filter,
  searchQuery,
  collapsedIssueIds
}: {
  route: IssueRouteExecutionHostId
  partition: IssuePartitionState | undefined
  filter: IssueListFilter
  searchQuery: string
  collapsedIssueIds: ReadonlySet<string>
}): React.JSX.Element {
  if (!partition || partition.status === 'idle' || partition.status === 'loading') {
    return <StatusRow icon={<Loader2 className="size-3 animate-spin" />} label="Loading Issues…" />
  }
  if (['unsupported', 'unavailable', 'offline', 'error'].includes(partition.status)) {
    return (
      <StatusRow
        icon={<AlertCircle className="size-3" />}
        label={partition.error ?? statusLabel(partition.status)}
      />
    )
  }
  const view = partition.issueViewsByFilter[filter]
  const rows = buildIssueRows({
    issueIds: view.issueIds,
    issuesById: partition.issuesById,
    conversationsById: partition.conversationsById,
    collapsedIssueIds,
    filter,
    searchQuery,
    unassignedKey: `unassigned:${route}`
  })
  const degraded =
    partition.status === 'degraded' ? (
      <StatusRow
        icon={<AlertCircle className="size-3" />}
        label={partition.error ?? 'Hook evidence unavailable; Issue CRUD remains available'}
      />
    ) : null
  if (rows.length === 0) {
    return (
      <>
        {degraded}
        <StatusRow label={searchQuery ? 'No matching Issues' : 'No Issues'} />
      </>
    )
  }
  return (
    <>
      {degraded}
      {rows.map((row) => (
        <IssueVirtualRow key={row.key} row={row} route={route} />
      ))}
    </>
  )
}

function StatusRow({ icon, label }: { icon?: React.ReactNode; label: string }): React.JSX.Element {
  return (
    <div className="flex min-h-12 items-center gap-1.5 px-4 text-xs text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'unsupported') {
    return 'Update this host to use Issues'
  }
  if (status === 'unavailable') {
    return 'Issue storage unavailable'
  }
  if (status === 'offline') {
    return 'Host offline'
  }
  return 'Could not load Issues'
}
