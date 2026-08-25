import type { z } from 'zod'
import { createStore } from 'zustand/vanilla'
import type { ConversationsListResult } from '../../../shared/issues/query-rpc-schemas'
import type {
  IssueListFilter,
  IssueListResult,
  IssueRouteExecutionHostId
} from '../../../shared/issues/types'
import { e2eConfig } from '../lib/e2e-config'
import {
  emptyIssuePartition,
  reduceConversationPage,
  reduceIssuePage,
  type IssuePartitionState,
  type IssuePartitionStatus
} from './issues-domain-page-reducers'

type ConversationListResult = z.infer<typeof ConversationsListResult>

export type {
  ConversationScopeCache,
  IssuePartitionState,
  IssuePartitionStatus,
  IssueViewCache
} from './issues-domain-page-reducers'

export type IssueDomainState = {
  partitionsByRouteExecutionHostId: Partial<Record<IssueRouteExecutionHostId, IssuePartitionState>>
  activeIssueRoute: {
    routeExecutionHostId: IssueRouteExecutionHostId
    issueId: string
  } | null
  sidebarRootMode: 'workspaces' | 'issues'
  filter: IssueListFilter
  searchQuery: string
  collapsedIssueIds: Set<string>
  setRouteStatus(
    route: IssueRouteExecutionHostId,
    status: IssuePartitionStatus,
    error?: string
  ): void
  applyIssuePage(
    route: IssueRouteExecutionHostId,
    filter: IssueListFilter,
    result: IssueListResult,
    append: boolean
  ): void
  applyConversationPage(
    route: IssueRouteExecutionHostId,
    scopeKey: string,
    result: ConversationListResult,
    append: boolean
  ): void
  setSidebarRootMode(mode: 'workspaces' | 'issues'): void
  setActiveIssueRoute(route: IssueDomainState['activeIssueRoute']): void
  setFilter(filter: IssueListFilter): void
  setSearchQuery(searchQuery: string): void
  toggleCollapsedIssue(issueId: string): void
}

export const issueDomainStore = createStore<IssueDomainState>((set) => ({
  partitionsByRouteExecutionHostId: {},
  activeIssueRoute: null,
  sidebarRootMode: 'workspaces',
  filter: 'all',
  searchQuery: '',
  collapsedIssueIds: new Set(),
  setRouteStatus: (route, status, error) =>
    set((state) => ({
      partitionsByRouteExecutionHostId: {
        ...state.partitionsByRouteExecutionHostId,
        [route]: {
          ...(state.partitionsByRouteExecutionHostId[route] ?? emptyIssuePartition()),
          status,
          error: error ?? null
        }
      }
    })),
  applyIssuePage: (route, filter, result, append) =>
    set((state) => ({
      partitionsByRouteExecutionHostId: {
        ...state.partitionsByRouteExecutionHostId,
        [route]: reduceIssuePage(
          state.partitionsByRouteExecutionHostId[route] ?? emptyIssuePartition(),
          filter,
          result,
          append
        )
      }
    })),
  applyConversationPage: (route, scopeKey, result, append) =>
    set((state) => ({
      partitionsByRouteExecutionHostId: {
        ...state.partitionsByRouteExecutionHostId,
        [route]: reduceConversationPage(
          state.partitionsByRouteExecutionHostId[route] ?? emptyIssuePartition(),
          scopeKey,
          result,
          append
        )
      }
    })),
  setSidebarRootMode: (sidebarRootMode) => set({ sidebarRootMode }),
  setActiveIssueRoute: (activeIssueRoute) => set({ activeIssueRoute }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleCollapsedIssue: (issueId) =>
    set((state) => {
      const collapsedIssueIds = new Set(state.collapsedIssueIds)
      if (collapsedIssueIds.has(issueId)) {
        collapsedIssueIds.delete(issueId)
      } else {
        collapsedIssueIds.add(issueId)
      }
      return { collapsedIssueIds }
    })
}))

if (e2eConfig.enabled && typeof window !== 'undefined') {
  const testWindow = window as unknown as Record<string, unknown>
  testWindow.__issueDomainStore = issueDomainStore
}
