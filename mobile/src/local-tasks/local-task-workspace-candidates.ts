import { z } from 'zod'
import { LOCAL_EXECUTION_HOST_ID } from '../../../src/shared/execution-host'
import { projectGroupIdFromRepoId } from '../../../src/shared/folder-workspace-worktree'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import { worktreeIdsEqual } from '../../../src/shared/worktree/id'
import { parseWorkspaceKey } from '../../../src/shared/workspace-scope'
import { salvagedOptional, salvagingArray } from '../../../src/shared/zod-salvage'
import type { RpcSendParams } from '../transport/rpc-params-contract'
import type { LocalTaskSetup } from './local-task-project-setups'

/** A workspace the desktop lists, as far as linking it to a task needs. */
export type LocalTaskWorkspaceCandidate = {
  worktreeId: string
  repoId: string
  hostId: string
  displayName: string
  branch: string
  instanceId: string | null
  folderWorkspaceId: string | null
}

// Why loose: `worktree.ps` rows carry twenty-odd fields; a row missing one of these drops alone.
const rowSchema = z.looseObject({
  worktreeId: z.string().min(1),
  repoId: z.string(),
  hostId: salvagedOptional('hostId', z.string()),
  displayName: salvagedOptional('displayName', z.string()),
  branch: salvagedOptional('branch', z.string()),
  worktreeInstanceId: salvagedOptional('worktreeInstanceId', z.string()),
  workspaceKind: salvagedOptional('workspaceKind', z.string()),
  isArchived: salvagedOptional('isArchived', z.boolean())
})

/** Reads the desktop's workspace rows, skipping archived ones and any row this build cannot read. */
export function readLocalTaskWorkspaceCandidates(rows: unknown): LocalTaskWorkspaceCandidate[] {
  const parsed = salvagingArray(rowSchema).safeParse(rows)
  if (!parsed.success) {
    return []
  }
  return parsed.data
    .filter((row) => !row.isArchived)
    .map((row) => {
      const scope =
        row.workspaceKind === 'folder-workspace' ? parseWorkspaceKey(row.worktreeId) : null
      return {
        worktreeId: row.worktreeId,
        repoId: row.repoId,
        hostId: row.hostId ?? LOCAL_EXECUTION_HOST_ID,
        displayName: row.displayName || row.branch || row.worktreeId,
        branch: row.branch ?? '',
        instanceId: row.worktreeInstanceId ?? null,
        folderWorkspaceId: scope?.type === 'folder' ? scope.folderWorkspaceId : null
      }
    })
}

/** Rows that belong to one task project: its repositories, and its folder workspaces. */
export function localTaskCandidatesForProject(
  candidates: readonly LocalTaskWorkspaceCandidate[],
  setups: readonly LocalTaskSetup[]
): LocalTaskWorkspaceCandidate[] {
  const repoIds = new Set(setups.map((setup) => setup.repoId))
  const groupIds = new Set(setups.flatMap((setup) => setup.projectGroupId ?? []))
  return candidates.filter((candidate) => {
    const group = projectGroupIdFromRepoId(candidate.repoId)
    return group ? groupIds.has(group) : repoIds.has(candidate.repoId)
  })
}

/** The link that already holds this workspace, matched as the desktop matches it. */
export function localTaskLinkHolding(
  links: LocalTaskLinks,
  candidate: Pick<
    LocalTaskWorkspaceCandidate,
    'worktreeId' | 'hostId' | 'instanceId' | 'folderWorkspaceId'
  >
): LocalTaskWorkspaceLink | null {
  return (
    links.workspaces.find((link) => {
      if (candidate.folderWorkspaceId) {
        return link.kind === 'folder' && link.folderWorkspaceId === candidate.folderWorkspaceId
      }
      if (candidate.instanceId && link.instanceId) {
        return link.instanceId === candidate.instanceId
      }
      return (
        link.hostId === candidate.hostId &&
        link.worktreeId !== null &&
        worktreeIdsEqual(link.worktreeId, candidate.worktreeId)
      )
    }) ?? null
  )
}

type LinkWorkspaceParams = RpcSendParams<'localTasks.links.linkWorkspace'>

/** The link a picked workspace makes, with the names it carries until the desktop resolves it. */
export function localTaskLinkParamsFor(
  candidate: LocalTaskWorkspaceCandidate,
  hostLabel: string
): Omit<LinkWorkspaceParams, 'clientOperationId' | 'taskId' | 'linkedVia' | 'replace'> {
  const names = {
    hostId: candidate.hostId,
    repoId: candidate.repoId,
    nameSnapshot: candidate.displayName,
    ...(hostLabel ? { hostLabelSnapshot: hostLabel } : {})
  }
  if (candidate.folderWorkspaceId) {
    return { ...names, kind: 'folder', folderWorkspaceId: candidate.folderWorkspaceId }
  }
  return {
    ...names,
    kind: 'git-worktree',
    worktreeId: candidate.worktreeId,
    ...(candidate.instanceId ? { instanceId: candidate.instanceId } : {}),
    ...(candidate.branch ? { branchSnapshot: candidate.branch } : {})
  }
}
