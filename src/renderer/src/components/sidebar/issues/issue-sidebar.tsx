import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Loader2, Search } from 'lucide-react'
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
import { SidebarHostBadge } from '../sidebar-host-badge'
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

  // 主机不再是结构:空主机整段不出现(Orca 自己的规则 —— 空主机只留在选择器里),
  // 有多个主机同时有内容时,主机降级成行上的一个小标签。
  const sections = useMemo(
    () =>
      visibleHosts
        .map((host) => {
          const route = host.id as IssueRouteExecutionHostId
          const partition = partitions[route]
          const pending =
            !partition || partition.status === 'idle' || partition.status === 'loading'
          const failure =
            partition &&
            ['unsupported', 'unavailable', 'offline', 'error'].includes(partition.status)
              ? (partition.error ?? statusLabel(partition.status))
              : partition?.status === 'degraded'
                ? (partition.error ?? 'Hook evidence unavailable; Issue CRUD remains available')
                : null
          const view = !pending && partition ? partition.issueViewsByFilter[filter] : undefined
          const rows =
            view && partition
              ? buildIssueRows({
                  issueIds: view.issueIds,
                  issuesById: partition.issuesById,
                  conversationsById: partition.conversationsById,
                  collapsedIssueIds,
                  filter,
                  searchQuery,
                  unassignedKey: `unassigned:${route}`
                })
              : []
          return { host, route, pending, failure, rows }
        })
        .filter((section) => section.pending || section.failure || section.rows.length > 0),
    [collapsedIssueIds, filter, partitions, searchQuery, visibleHosts]
  )
  const showHostLabels = sections.length > 1
  // 摊平成一维再虚拟化:「未归属」一栏实测可达数百条,全量渲染会把侧栏拖垮。
  // 复用 Workspaces 同一个 @tanstack/react-virtual,而不是另找一套。
  const flatRows = useMemo(
    () =>
      sections.flatMap((section) => {
        const hostLabel = showHostLabels ? section.host.label : undefined
        const status = section.pending
          ? [
              {
                kind: 'status' as const,
                key: `${section.route}:loading`,
                label: 'Loading Issues…',
                spinning: true,
                hostLabel
              }
            ]
          : section.failure
            ? [
                {
                  kind: 'status' as const,
                  key: `${section.route}:failure`,
                  label: section.failure,
                  spinning: false,
                  hostLabel
                }
              ]
            : []
        return [
          ...status,
          ...section.rows.map((row) => ({
            kind: 'issue' as const,
            key: `${section.route}:${row.key}`,
            row,
            route: section.route,
            hostLabel
          }))
        ]
      }),
    [sections, showHostLabels]
  )
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    // 行是 h-7(28px);状态行是 min-h-7,measureElement 会把实际高度量回来
    estimateSize: () => 28,
    overscan: 12
  })

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
      <div
        ref={scrollRef}
        className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto py-1"
      >
        {flatRows.length === 0 ? (
          <StatusRow label={searchQuery ? 'No matching Issues' : 'No Issues'} />
        ) : null}
        {/* 虚拟化后行不再按主机分块,但 region 仍需真实包住内容 ——
            已提交的 16 步旅程 spec 用 toContainText 断言它。单主机时它就是整个列表。 */}
        <div
          role="region"
          aria-label={`${sections[0]?.host.label ?? 'Local'} Issues`}
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = flatRows[virtualRow.index]
            if (!item) {
              return null
            }
            return (
              <div
                key={item.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {item.kind === 'status' ? (
                  <StatusRow
                    icon={
                      item.spinning ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <AlertCircle className="size-3" />
                      )
                    }
                    label={item.label}
                    hostLabel={item.hostLabel}
                  />
                ) : (
                  <IssueVirtualRow row={item.row} route={item.route} hostLabel={item.hostLabel} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusRow({
  icon,
  label,
  hostLabel
}: {
  icon?: React.ReactNode
  label: string
  hostLabel?: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-7 items-center gap-1.5 px-3 text-xs text-muted-foreground">
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hostLabel ? <SidebarHostBadge label={hostLabel} /> : null}
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
