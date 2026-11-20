import { useEffect } from 'react'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { createBlankWorkspace as createUpstreamBlankWorkspace } from '../new-workspace/creation/blank-workspace-create'
import {
  createWorkspaceFromComposerSource as createUpstreamSourceWorkspace,
  type CreateWorkspaceFromComposerArgs
} from '../new-workspace/creation/source-workspace-create'
import type { WorktreeCreateResult } from '../new-workspace/creation/worktree-create-retry'
import type { LocalTaskCreateRun } from './local-task-create-source-start'

// Keyed by the sheet's client: the sheet's submit reaches only these create functions.
const routes = new WeakMap<RpcClient, LocalTaskCreateRun>()

/** While a task is the new-workspace sheet's source, creating on its client runs the task's Start. */
export function useLocalTaskCreateRoute(
  client: RpcClient | null | undefined,
  run: LocalTaskCreateRun | null
): void {
  useEffect(() => (client && run ? routeLocalTaskCreate(client, run) : undefined), [client, run])
}

/** Routes creates on `client` to `run` until the returned release. */
export function routeLocalTaskCreate(client: RpcClient, run: LocalTaskCreateRun): () => void {
  routes.set(client, run)
  return () => {
    if (routes.get(client) === run) {
      routes.delete(client)
    }
  }
}

/** Upstream's blank create, unless a task is the source: then the task's own create, same request. */
export function createBlankWorkspace(
  args: Parameters<typeof createUpstreamBlankWorkspace>[0]
): Promise<WorktreeCreateResult> {
  const run = routes.get(args.client)
  return run
    ? run({
        name: args.nameWasGenerated ? '' : args.baseName,
        agent: args.createdWithAgentId ?? null,
        setupDecision: args.setupDecision,
        note: args.comment
      })
    : createUpstreamBlankWorkspace(args)
}

/** Upstream's sourced create, unless a task is the source: then the task's own create, same request. */
export function createWorkspaceFromComposerSource(
  args: CreateWorkspaceFromComposerArgs
): Promise<WorktreeCreateResult> {
  const run = routes.get(args.client)
  return run
    ? run({
        name: args.workspaceName ?? '',
        agent: args.agent.choice === 'blank' ? null : args.agent.choice,
        setupDecision: args.setupDecision,
        note: args.note
      })
    : createUpstreamSourceWorkspace(args)
}
