import {
  normalizeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../execution-host'
import { DEFAULT_REPO_BADGE_COLOR } from '../constants'
import type { ProjectHostSetupProjection } from '../project-host-setup-projection'
import type { Project, ProjectHostSetup } from '../project-types'

export type SidebarProjectMergeMember = { hostId: ExecutionHostId; repoId: string }
export type SidebarProjectMerge = {
  id: string
  name: string
  members: SidebarProjectMergeMember[]
}

const MERGED_PROJECT_PREFIX = 'sidebar-merged:'

export function isSidebarMergedProjectId(id: string): boolean {
  return id.startsWith(MERGED_PROJECT_PREFIX)
}

export function sidebarProjectMemberKey(member: SidebarProjectMergeMember): string {
  return JSON.stringify([member.hostId, member.repoId])
}

export function replaceSidebarProjectMerge(
  current: readonly SidebarProjectMerge[],
  merge: SidebarProjectMerge
): SidebarProjectMerge[] {
  const selected = new Set(merge.members.map(sidebarProjectMemberKey))
  return normalizeSidebarProjectMerges([
    ...current
      .filter((entry) => entry.id !== merge.id)
      .map((entry) => ({
        ...entry,
        members: entry.members.filter((member) => !selected.has(sidebarProjectMemberKey(member)))
      })),
    merge
  ])
}

export function normalizeSidebarProjectMerges(value: unknown): SidebarProjectMerge[] {
  if (!Array.isArray(value)) {
    return []
  }
  const result: SidebarProjectMerge[] = []
  const ids = new Set<string>()
  const assigned = new Set<string>()
  for (const candidate of value.slice(0, 128)) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('id' in candidate) ||
      typeof candidate.id !== 'string' ||
      !('name' in candidate) ||
      typeof candidate.name !== 'string' ||
      !('members' in candidate) ||
      !Array.isArray(candidate.members)
    ) {
      continue
    }
    const id = candidate.id.trim().slice(0, 128)
    const name = candidate.name.trim().slice(0, 128)
    if (!id || !name || ids.has(id)) {
      continue
    }
    const members: SidebarProjectMergeMember[] = []
    const keys = new Set<string>()
    for (const member of candidate.members.slice(0, 512)) {
      if (
        !member ||
        typeof member !== 'object' ||
        !('hostId' in member) ||
        typeof member.hostId !== 'string' ||
        !('repoId' in member) ||
        typeof member.repoId !== 'string'
      ) {
        continue
      }
      const hostId = normalizeExecutionHostId(member.hostId)
      const repoId = member.repoId.trim()
      if (!hostId || !repoId) {
        continue
      }
      const key = sidebarProjectMemberKey({ hostId, repoId })
      if (assigned.has(key) || keys.has(key)) {
        continue
      }
      keys.add(key)
      members.push({ hostId, repoId })
    }
    if (members.length < 2) {
      continue
    }
    ids.add(id)
    for (const key of keys) {
      assigned.add(key)
    }
    result.push({ id, name, members })
  }
  return result
}

function setupMemberKey(setup: ProjectHostSetup): string {
  const hostId = setup.connectionId
    ? toSshExecutionHostId(setup.connectionId)
    : (normalizeExecutionHostId(setup.executionHostId) ?? setup.hostId)
  return sidebarProjectMemberKey({ hostId, repoId: setup.repoId })
}

/** Produces display rows only; callers retain the authoritative catalog for execution. */
export function applySidebarProjectMerges(
  projection: ProjectHostSetupProjection,
  value: unknown
): ProjectHostSetupProjection {
  const merges = normalizeSidebarProjectMerges(value)
  if (merges.length === 0) {
    return projection
  }
  const byMember = new Map<string, SidebarProjectMerge>()
  for (const merge of merges) {
    for (const member of merge.members) {
      byMember.set(sidebarProjectMemberKey(member), merge)
    }
  }
  const originalProjects = new Map(projection.projects.map((project) => [project.id, project]))
  const displayProjects = new Map<string, Project>()
  let changed = false
  const setups = projection.setups.map((setup) => {
    const merge = byMember.get(setupMemberKey(setup))
    if (!merge || !setup.repoId) {
      return setup
    }
    changed = true
    const projectId = `${MERGED_PROJECT_PREFIX}${merge.id}`
    const existing = displayProjects.get(projectId)
    if (existing) {
      if (!existing.sourceRepoIds.includes(setup.repoId)) {
        existing.sourceRepoIds.push(setup.repoId)
      }
      if (setup.kind !== 'folder') {
        existing.kind = 'git'
      }
    } else {
      const source = originalProjects.get(setup.projectId)
      displayProjects.set(projectId, {
        id: projectId,
        displayName: merge.name,
        badgeColor: source?.badgeColor ?? DEFAULT_REPO_BADGE_COLOR,
        kind: setup.kind,
        sourceRepoIds: [setup.repoId],
        createdAt: source?.createdAt ?? 0,
        updatedAt: source?.updatedAt ?? 0
      })
    }
    return { ...setup, projectId }
  })
  if (!changed) {
    return projection
  }
  const usedProjects = new Set(setups.map((setup) => setup.projectId))
  return {
    projects: [
      ...projection.projects.filter((project) => usedProjects.has(project.id)),
      ...displayProjects.values()
    ],
    setups
  }
}
