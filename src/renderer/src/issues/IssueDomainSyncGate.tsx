import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import type { IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { useSidebarHostScopeOptions } from '../components/sidebar/use-sidebar-host-scope-options'
import { registerConversationCanonicalTitles } from './conversation-canonical-titles'
import { startIssueDomainSync, type IssueDomainSync } from './issue-domain-sync'
import { issueDomainStore } from './issues-domain-store'

export function IssueDomainSyncGate(): null {
  const { hostOptions } = useSidebarHostScopeOptions()
  const sidebarRootMode = useStore(issueDomainStore, (state) => state.sidebarRootMode)
  const activeIssueRoute = useStore(issueDomainStore, (state) => state.activeIssueRoute)
  const filter = useStore(issueDomainStore, (state) => state.filter)
  const syncRef = useRef<IssueDomainSync | null>(null)
  // Why: host status churn rebuilds hostOptions; only a change in the host set may start reads.
  const routeKey = hostOptions.map((host) => host.id).join('\n')
  const issuesVisible = sidebarRootMode === 'issues' || activeIssueRoute !== null

  useEffect(() => registerConversationCanonicalTitles(), [])

  useEffect(() => {
    const sync = startIssueDomainSync()
    syncRef.current = sync
    return () => {
      sync.stop()
      syncRef.current = null
    }
  }, [])

  useEffect(() => {
    syncRef.current?.update({ routes: parseRouteKey(routeKey), filter, issuesVisible })
  }, [routeKey, filter, issuesVisible])

  return null
}

function parseRouteKey(routeKey: string): IssueRouteExecutionHostId[] {
  return routeKey.split('\n').flatMap((id) => normalizeExecutionHostId(id) ?? [])
}
