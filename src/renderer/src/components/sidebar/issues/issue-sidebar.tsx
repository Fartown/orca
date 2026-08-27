import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Search, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import type { IssuePartitionState } from '@/issues/issues-domain-store'
import { SidebarCountBadge } from '../sidebar-count-badge'
import type { IssueListFilter, IssueRouteExecutionHostId } from '../../../../../shared/issues/types'
import { useSidebarHostScopeOptions } from '../use-sidebar-host-scope-options'
import { buildIssueRows } from './build-issue-rows'
import { IssueVirtualRow } from './issue-virtual-row'

// 规格照抄 SidebarGroupByToggle,只是不撑满整行 —— 同一行右侧还有搜索与主机选择。
const FILTER_SEGMENT_CLASS =
  'h-6 px-1.5 text-[10px] data-[state=on]:bg-foreground/10 data-[state=on]:font-semibold data-[state=on]:text-foreground'

export function IssueSidebar(): React.JSX.Element {
  const { hostOptions } = useSidebarHostScopeOptions()
  const partitions = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId)
  const filter = useIssueDomainStore((state) => state.filter)
  const searchQuery = useIssueDomainStore((state) => state.searchQuery)
  const collapsedIssueIds = useIssueDomainStore((state) => state.collapsedIssueIds)
  const setFilter = useIssueDomainStore((state) => state.setFilter)
  const setSearchQuery = useIssueDomainStore((state) => state.setSearchQuery)
  const [selectedHost, setSelectedHost] = useState<'all' | IssueRouteExecutionHostId>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const visibleHosts = useMemo(
    () =>
      selectedHost === 'all' ? hostOptions : hostOptions.filter((host) => host.id === selectedHost),
    [hostOptions, selectedHost]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-worktree-sidebar-border px-2 py-1.5">
        <div className="flex items-center gap-1">
          {/* 三个筛选是一组分段控件,不是三个各自带硬编码活动态的 ghost 按钮 */}
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => {
              if (value) {
                setFilter(value as IssueListFilter)
              }
            }}
            variant="outline"
            size="sm"
            className="h-6"
          >
            {(
              [
                ['all', 'All'],
                ['needs-me', 'Needs me'],
                ['archived', 'Archived']
              ] as const
            ).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className={FILTER_SEGMENT_CLASS}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* Orca 侧栏没有常驻筛选输入框,收成按钮,需要时再展开 */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Filter Issues by title"
            aria-expanded={searchOpen || searchQuery.length > 0}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search className="size-3.5" />
          </Button>
          {/* 只有一个主机时选择器是噪音,和分组头同一条规则(host-section-rows.ts:276) */}
          {hostOptions.length > 1 ? (
            <Select
              value={selectedHost}
              onValueChange={(value) => setSelectedHost(value as typeof selectedHost)}
            >
              <SelectTrigger
                size="sm"
                className="h-6 max-w-28 border-0 bg-transparent px-1.5 text-[10px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all" className="text-xs">
                  All hosts
                </SelectItem>
                {hostOptions.map((host) => (
                  <SelectItem key={host.id} value={host.id} className="text-xs">
                    {host.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {searchOpen || searchQuery ? (
          <Input
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter titles"
            className="mt-1.5 h-6 bg-input/50 text-xs shadow-none"
            aria-label="Filter Issues"
          />
        ) : null}
      </div>
      <div className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {visibleHosts.map((host) => {
          const route = host.id as IssueRouteExecutionHostId
          const partition = partitions[route]
          const issueCount = partition?.issueViewsByFilter[filter]?.issueIds.length ?? 0
          return (
            <section key={host.id} aria-label={`${host.label} Issues`}>
              {/* 只有一个主机时不画分组头 —— 与 host-section-rows.ts:276 同一规则:
                  「a lone host section is pure noise」。多主机时才和 Workspaces 侧同形。 */}
              {visibleHosts.length > 1 ? (
                <div className="px-2 pt-1">
                  <div className="flex h-8 w-full items-center gap-2 rounded-md border border-worktree-sidebar-border bg-worktree-sidebar-accent/70 px-2 text-left">
                    <Server className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {host.label}
                      {partition?.authority?.profileLabel
                        ? ` · ${partition.authority.profileLabel}`
                        : ''}
                    </span>
                    {issueCount > 0 ? (
                      <SidebarCountBadge count={issueCount} label={`${issueCount} Issues`} />
                    ) : null}
                  </div>
                </div>
              ) : null}
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
    <div className="flex min-h-7 items-center gap-1.5 px-3 text-xs text-muted-foreground">
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
