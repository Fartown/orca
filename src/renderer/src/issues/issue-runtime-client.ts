import type { z } from 'zod'
import { parseExecutionHostId } from '../../../shared/execution-host'
import {
  IssueFeatureStatusResult,
  IssuesGetResult,
  IssuesListResult,
  ConversationsListResult,
  IssuesListRoundsResult
} from '../../../shared/issues/query-rpc-schemas'
import { ORCA_ISSUES_RUNTIME_CAPABILITY } from '../../../shared/issues/constants'
import type {
  AuthorityExecutionHostId,
  IssueRouteExecutionHostId
} from '../../../shared/issues/types'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '../runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../runtime/runtime-client-target'

export class IssueRuntimeUnsupportedError extends Error {
  readonly code = 'issue_runtime_unsupported'

  constructor(readonly routeExecutionHostId: IssueRouteExecutionHostId) {
    super('This Orca host version does not support Issues.')
    this.name = 'IssueRuntimeUnsupportedError'
  }
}

export type IssueRuntimeRoute = {
  routeExecutionHostId: IssueRouteExecutionHostId
  target: RuntimeClientTarget
  authorityExecutionHostId: AuthorityExecutionHostId
}

export function resolveIssueRuntimeRoute(
  routeExecutionHostId: IssueRouteExecutionHostId
): IssueRuntimeRoute {
  const parsed = parseExecutionHostId(routeExecutionHostId)
  if (!parsed) {
    throw new Error(`Invalid Issue route ${routeExecutionHostId}`)
  }
  if (parsed.kind === 'runtime') {
    return {
      routeExecutionHostId,
      target: { kind: 'environment', environmentId: parsed.environmentId },
      authorityExecutionHostId: 'local'
    }
  }
  return {
    routeExecutionHostId,
    target: { kind: 'local' },
    authorityExecutionHostId: parsed.id
  }
}

export class IssueRuntimeClient {
  constructor(readonly route: IssueRuntimeRoute) {}

  static forRoute(routeExecutionHostId: IssueRouteExecutionHostId): IssueRuntimeClient {
    return new IssueRuntimeClient(resolveIssueRuntimeRoute(routeExecutionHostId))
  }

  async supportsIssues(): Promise<boolean> {
    return this.route.target.kind === 'local'
      ? true
      : runtimeEnvironmentSupportsCapability(
          this.route.target.environmentId,
          ORCA_ISSUES_RUNTIME_CAPABILITY
        )
  }

  async status() {
    await this.requireCapability()
    return this.call('issues.status', {}, IssueFeatureStatusResult)
  }

  async listIssues(params: Record<string, unknown>) {
    await this.requireCapability()
    return this.call('issues.list', params, IssuesListResult)
  }

  async listConversations(params: Record<string, unknown>) {
    await this.requireCapability()
    return this.call('conversations.list', params, ConversationsListResult)
  }

  async listRounds(params: Record<string, unknown>) {
    await this.requireCapability()
    return this.call('issues.listRounds', params, IssuesListRoundsResult)
  }

  async getIssue(issueId: string) {
    await this.requireCapability()
    return this.call('issues.get', { issueId }, IssuesGetResult)
  }

  async mutate<TResult>(method: string, params: Record<string, unknown>): Promise<TResult> {
    await this.requireCapability()
    return callRuntimeRpc<TResult>(this.route.target, method, {
      ...params,
      authorityExecutionHostId: this.route.authorityExecutionHostId
    })
  }

  private async call<TSchema extends z.ZodType>(
    method: string,
    params: Record<string, unknown>,
    schema: TSchema
  ): Promise<z.infer<TSchema>> {
    const result = await callRuntimeRpc<unknown>(this.route.target, method, {
      ...params,
      authorityExecutionHostId: this.route.authorityExecutionHostId
    })
    const parsed = schema.parse(result)
    const authority = readAuthority(parsed)
    if (authority && authority.authorityExecutionHostId !== this.route.authorityExecutionHostId) {
      throw new Error('issue_authority_route_mismatch')
    }
    return parsed
  }

  private async requireCapability(): Promise<void> {
    if (!(await this.supportsIssues())) {
      throw new IssueRuntimeUnsupportedError(this.route.routeExecutionHostId)
    }
  }
}

function readAuthority(value: unknown): { authorityExecutionHostId: string } | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const authority = (value as { authority?: unknown }).authority
  if (!authority || typeof authority !== 'object') {
    return null
  }
  const authorityExecutionHostId = (authority as { authorityExecutionHostId?: unknown })
    .authorityExecutionHostId
  return typeof authorityExecutionHostId === 'string' ? { authorityExecutionHostId } : null
}
