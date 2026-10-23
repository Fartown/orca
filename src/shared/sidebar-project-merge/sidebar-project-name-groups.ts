import type {
  ProjectGroupingIndex,
  ProjectSectionEntry,
  ProjectSectionRepo,
  ProjectSectionSetup
} from '../project-section-grouping'

export type SidebarProjectNameTarget = {
  key: string
  label: string
  repoId: string
  protectedCheckout: boolean
  containerKey?: string | null
  hostKey?: string
}

export type SidebarProjectNameGroup = {
  key: string
  label: string
  repoIds: ReadonlySet<string>
}

export function buildSidebarProjectNameGroupsForSetups(
  index: ProjectGroupingIndex,
  repos: ReadonlyMap<string, Pick<ProjectSectionRepo, 'displayName' | 'projectGroupId'>>,
  getGrouping: (
    repoId: string,
    repos: ReadonlyMap<string, Pick<ProjectSectionRepo, 'displayName'>>,
    index: ProjectGroupingIndex
  ) => { key: string; label: string },
  isProtected: (setup: ProjectSectionSetup, index: ProjectGroupingIndex) => boolean,
  groupByHost = false
): ReadonlyMap<string, SidebarProjectNameGroup> {
  return buildSidebarProjectNameGroups(
    [...index.setupByRepoId.values()]
      .filter((setup) => index.projectById.has(setup.projectId))
      .map((setup) => ({
        ...getGrouping(setup.repoId, repos, index),
        repoId: setup.repoId,
        containerKey: repos.get(setup.repoId)?.projectGroupId,
        hostKey: groupByHost ? setup.hostId : undefined,
        protectedCheckout: !repos.has(setup.repoId) || isProtected(setup, index)
      }))
  )
}

export function buildSidebarProjectNameGroups(
  targets: readonly SidebarProjectNameTarget[]
): ReadonlyMap<string, SidebarProjectNameGroup> {
  const byName = new Map<string, SidebarProjectNameTarget[]>()
  const containers = new Map<string, Set<string>>()
  const protectedKeys = new Set(
    targets.filter((target) => target.protectedCheckout).map((target) => target.key)
  )
  for (const target of targets) {
    const scope = containers.get(target.key) ?? new Set<string>()
    scope.add(JSON.stringify([target.containerKey ?? '', target.hostKey ?? '']))
    containers.set(target.key, scope)
  }
  for (const target of targets) {
    const name = target.label.trim()
    if (!name || protectedKeys.has(target.key) || (containers.get(target.key)?.size ?? 0) > 1) {
      continue
    }
    const scopedName = JSON.stringify([target.containerKey ?? '', target.hostKey ?? '', name])
    const members = byName.get(scopedName) ?? []
    members.push(target)
    byName.set(scopedName, members)
  }
  const groups = new Map<string, SidebarProjectNameGroup>()
  for (const members of byName.values()) {
    const label = members[0].label.trim()
    const sourceKeys = new Set(members.map((member) => member.key))
    if (sourceKeys.size < 2) {
      continue
    }
    const group = {
      key: `sidebar-name:${encodeURIComponent(label)}${members[0].containerKey ? `::group:${encodeURIComponent(members[0].containerKey)}` : ''}${members[0].hostKey ? `::host:${encodeURIComponent(members[0].hostKey)}` : ''}`,
      label,
      repoIds: new Set(members.map((member) => member.repoId))
    }
    for (const key of sourceKeys) {
      groups.set(key, group)
    }
  }
  return groups
}

export function mergeSidebarProjectNameSections<Item, R extends ProjectSectionRepo>(
  sections: ReadonlyMap<string, ProjectSectionEntry<Item, R>>,
  groups: ReadonlyMap<string, SidebarProjectNameGroup>
): Map<string, ProjectSectionEntry<Item, R>> {
  const display = new Map<string, ProjectSectionEntry<Item, R>>()
  for (const [key, section] of sections) {
    const group = groups.get(key)
    if (!group) {
      display.set(key, section)
      continue
    }
    const previous = display.get(group.key)
    display.set(group.key, {
      ...(previous ?? section),
      label: group.label,
      items: [...(previous?.items ?? []), ...section.items],
      activityItems: [...(previous?.activityItems ?? []), ...(section.activityItems ?? [])],
      repoIds: new Set([...(previous?.repoIds ?? []), ...section.repoIds])
    })
  }
  return display
}
