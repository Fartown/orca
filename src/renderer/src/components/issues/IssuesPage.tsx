import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type {
  IssueDetail as IssueDetailData,
  RoundRecordPreview
} from '../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { IssueDetail } from './IssueDetail'

export default function IssuesPage(): React.JSX.Element | null {
  const activeRoute = useIssueDomainStore((state) => state.activeIssueRoute)
  const activePartition = useIssueDomainStore((state) =>
    state.activeIssueRoute
      ? state.partitionsByRouteExecutionHostId[state.activeIssueRoute.routeExecutionHostId]
      : undefined
  )
  const [detail, setDetail] = useState<IssueDetailData | null>(null)
  const [rounds, setRounds] = useState<RoundRecordPreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), [])

  useEffect(() => {
    let disposed = false
    if (!activeRoute) {
      setDetail(null)
      setRounds([])
      return
    }
    setError(null)
    const load = async (): Promise<void> => {
      try {
        const client = IssueRuntimeClient.forRoute(activeRoute.routeExecutionHostId)
        const nextDetail = await client.getIssue(activeRoute.issueId)
        const nextRounds: RoundRecordPreview[] = []
        let page = await client.listRounds({
          mode: 'start',
          scope: { kind: 'issue', issueId: activeRoute.issueId },
          limit: 200
        })
        while (page.status === 'snapshot-page') {
          nextRounds.push(...page.rounds)
          if (!page.nextCursor) {
            break
          }
          page = await client.listRounds({
            mode: 'continue',
            scope: { kind: 'issue', issueId: activeRoute.issueId },
            snapshotFactsRevision: page.snapshotFactsRevision,
            cursor: page.nextCursor,
            limit: 200
          })
        }
        if (!disposed) {
          setDetail(nextDetail)
          setRounds(nextRounds)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [activeRoute, refreshVersion])

  if (!activeRoute) {
    return null
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4" />
        {error}
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Issue…
      </div>
    )
  }
  return (
    <IssueDetail
      route={activeRoute.routeExecutionHostId}
      detail={detail}
      rounds={rounds}
      onChanged={refresh}
      canCreateChild={issueDepth(detail.issue.id, activePartition?.issuesById ?? {}) < 2}
    />
  )
}

function issueDepth(
  issueId: string,
  issuesById: Record<string, { parentId: string | null }>
): number {
  let depth = 0
  let current = issuesById[issueId]
  const visited = new Set<string>()
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    depth += 1
    current = issuesById[current.parentId]
  }
  return depth
}
