import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useStore } from 'zustand'
import type { IssueListFilter, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { useSidebarHostScopeOptions } from '../components/sidebar/use-sidebar-host-scope-options'
import { registerConversationCanonicalTitles } from './conversation-canonical-titles'
import { IssueRuntimeClient, IssueRuntimeUnsupportedError } from './issue-runtime-client'
import { issueDomainStore } from './issues-domain-store'

const ISSUES_VISIBLE_POLL_MS = 5_000
const WORKSPACES_VISIBLE_POLL_MS = 15_000
const SNAPSHOT_RESTART_LIMIT = 3

export function IssueDomainSyncGate(): null {
  const { hostOptions } = useSidebarHostScopeOptions()
  const sidebarRootMode = useStore(issueDomainStore, (state) => state.sidebarRootMode)
  const activeIssueRoute = useStore(issueDomainStore, (state) => state.activeIssueRoute)
  const filter = useStore(issueDomainStore, (state) => state.filter)
  const refreshSequence = useRef(0)
  const routeIds = useMemo(
    () => hostOptions.map((host) => host.id as IssueRouteExecutionHostId),
    [hostOptions]
  )
  const issuesVisible = sidebarRootMode === 'issues' || activeIssueRoute !== null

  useEffect(() => registerConversationCanonicalTitles(), [])

  useEffect(() => {
    let disposed = false
    const intervalMs = issuesVisible ? ISSUES_VISIBLE_POLL_MS : WORKSPACES_VISIBLE_POLL_MS
    const refresh = async (): Promise<void> => {
      const sequence = ++refreshSequence.current
      await Promise.all(
        routeIds.map(async (route) => {
          if (disposed) {
            return
          }
          await refreshRoute(route, filter, issuesVisible, sequence, refreshSequence)
        })
      )
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), intervalMs)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [filter, issuesVisible, routeIds])

  return null
}

async function refreshRoute(
  route: IssueRouteExecutionHostId,
  filter: IssueListFilter,
  loadIssues: boolean,
  sequence: number,
  sequenceRef: MutableRefObject<number>
): Promise<void> {
  const actions = issueDomainStore.getState()
  const client = IssueRuntimeClient.forRoute(route)
  beginIssueRouteRefresh(route)
  try {
    const status = await client.status()
    if (sequence !== sequenceRef.current) {
      return
    }
    if (status.status === 'unavailable') {
      actions.setRouteStatus(route, 'unavailable', readinessReasonLabel(status.reason))
      return
    }
    actions.setRouteStatus(
      route,
      status.status === 'degraded' ? 'degraded' : 'ready',
      status.status === 'degraded' ? readinessReasonLabel(status.reason) : undefined
    )
    if (loadIssues) {
      await refreshIssuePages(client, route, filter, sequence, sequenceRef)
    }
    await refreshConversationPages(client, route, sequence, sequenceRef)
  } catch (error) {
    if (sequence !== sequenceRef.current) {
      return
    }
    if (error instanceof IssueRuntimeUnsupportedError) {
      actions.setRouteStatus(route, 'unsupported', error.message)
    } else {
      actions.setRouteStatus(
        route,
        'offline',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}

function readinessReasonLabel(reason: string | null): string | undefined {
  if (reason === 'hook-disabled') {
    return 'Hook evidence is disabled; Issue CRUD remains available'
  }
  if (reason === 'hook-start-failed') {
    return 'Hook evidence failed; Issue CRUD remains available'
  }
  if (reason === 'storage-migration-failed') {
    return 'Issue storage migration failed'
  }
  if (reason === 'storage-open-failed') {
    return 'Issue storage is unavailable'
  }
  return reason ?? undefined
}

export async function refreshIssuePages(
  client: Pick<IssueRuntimeClient, 'listIssues'>,
  route: IssueRouteExecutionHostId,
  filter: IssueListFilter,
  sequence: number,
  sequenceRef: MutableRefObject<number>
): Promise<void> {
  const previousView =
    issueDomainStore.getState().partitionsByRouteExecutionHostId[route]?.issueViewsByFilter[filter]
  const previousRevision = previousView?.snapshotFactsRevision
  const previousRuntimeRevision = previousView?.snapshotRuntimeRevision
  for (let attempt = 0; attempt < SNAPSHOT_RESTART_LIMIT; attempt += 1) {
    let result = await client.listIssues({
      mode: 'start',
      filter,
      ...(attempt === 0 && previousRevision !== null && previousRevision !== undefined
        ? { sinceFactsRevision: previousRevision }
        : {}),
      ...(attempt === 0 && previousRuntimeRevision !== null && previousRuntimeRevision !== undefined
        ? { sinceRuntimeRevision: previousRuntimeRevision }
        : {}),
      limit: 200
    })
    if (sequence !== sequenceRef.current) {
      return
    }
    issueDomainStore.getState().applyIssuePage(route, filter, result, false)
    if (result.status !== 'snapshot-page') {
      return
    }
    let stale = false
    while (result.nextCursor) {
      result = await client.listIssues({
        mode: 'continue',
        filter,
        snapshotFactsRevision: result.snapshotFactsRevision,
        snapshotTreeRevision: result.snapshotTreeRevision,
        ...(result.snapshotRuntimeRevision !== undefined
          ? { snapshotRuntimeRevision: result.snapshotRuntimeRevision }
          : {}),
        cursor: result.nextCursor,
        limit: 200
      })
      if (sequence !== sequenceRef.current) {
        return
      }
      issueDomainStore.getState().applyIssuePage(route, filter, result, true)
      if (result.status === 'stale') {
        stale = true
        break
      }
      if (result.status !== 'snapshot-page') {
        return
      }
    }
    if (!stale) {
      return
    }
  }
  throw new Error('Issue snapshot changed repeatedly while paging.')
}

export async function refreshConversationPages(
  client: Pick<IssueRuntimeClient, 'listConversations'>,
  route: IssueRouteExecutionHostId,
  sequence: number,
  sequenceRef: MutableRefObject<number>
): Promise<void> {
  const scope = { kind: 'authority' as const }
  const previousScope =
    issueDomainStore.getState().partitionsByRouteExecutionHostId[route]?.conversationScopesByKey
      .authority
  const previousRevision = previousScope?.snapshotFactsRevision
  const previousRuntimeRevision = previousScope?.snapshotRuntimeRevision
  for (let attempt = 0; attempt < SNAPSHOT_RESTART_LIMIT; attempt += 1) {
    let result = await client.listConversations({
      mode: 'start',
      scope,
      ...(attempt === 0 && previousRevision !== null && previousRevision !== undefined
        ? { sinceFactsRevision: previousRevision }
        : {}),
      ...(attempt === 0 && previousRuntimeRevision !== null && previousRuntimeRevision !== undefined
        ? { sinceRuntimeRevision: previousRuntimeRevision }
        : {}),
      limit: 200
    })
    if (sequence !== sequenceRef.current) {
      return
    }
    issueDomainStore.getState().applyConversationPage(route, 'authority', result, false)
    if (result.status !== 'snapshot-page') {
      return
    }
    let stale = false
    while (result.nextCursor) {
      result = await client.listConversations({
        mode: 'continue',
        scope,
        snapshotFactsRevision: result.snapshotFactsRevision,
        ...(result.snapshotRuntimeRevision !== undefined
          ? { snapshotRuntimeRevision: result.snapshotRuntimeRevision }
          : {}),
        cursor: result.nextCursor,
        limit: 200
      })
      if (sequence !== sequenceRef.current) {
        return
      }
      issueDomainStore.getState().applyConversationPage(route, 'authority', result, true)
      if (result.status === 'stale') {
        stale = true
        break
      }
      if (result.status !== 'snapshot-page') {
        return
      }
    }
    if (!stale) {
      return
    }
  }
  throw new Error('Conversation snapshot changed repeatedly while paging.')
}

export function beginIssueRouteRefresh(route: IssueRouteExecutionHostId): void {
  const state = issueDomainStore.getState()
  const partition = state.partitionsByRouteExecutionHostId[route]
  if (!partition || partition.status === 'idle') {
    state.setRouteStatus(route, 'loading')
  }
}
