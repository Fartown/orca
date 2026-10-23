import type { ProjectSectionEntry, ProjectSectionRepo } from '../project-section-grouping'

export type SidebarProjectNameTarget = {
  key: string
  label: string
  repoId: string
  protectedCheckout: boolean
}

export type SidebarProjectNameGroup = {
  key: string
  label: string
  sourceKeys: ReadonlySet<string>
  repoIds: ReadonlySet<string>
}

export function buildSidebarProjectNameGroups(
  targets: readonly SidebarProjectNameTarget[]
): ReadonlyMap<string, SidebarProjectNameGroup> {
  const byName = new Map<string, SidebarProjectNameTarget[]>()
  for (const target of targets) {
    const name = target.label.trim()
    if (!name || target.protectedCheckout) {
      continue
    }
    const members = byName.get(name) ?? []
    members.push(target)
    byName.set(name, members)
  }
  const groups = new Map<string, SidebarProjectNameGroup>()
  for (const [label, members] of byName) {
    const sourceKeys = new Set(members.map((member) => member.key))
    if (sourceKeys.size < 2) {
      continue
    }
    const group = {
      key: `sidebar-name:${encodeURIComponent(label)}`,
      label,
      sourceKeys,
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
      ...section,
      label: group.label,
      items: [...(previous?.items ?? []), ...section.items],
      activityItems: [...(previous?.activityItems ?? []), ...(section.activityItems ?? [])],
      repoIds: new Set([...(previous?.repoIds ?? []), ...section.repoIds])
    })
  }
  return display
}

export function getSidebarProjectNameCollapsedGroups(
  collapsed: Set<string>,
  groups: ReadonlyMap<string, SidebarProjectNameGroup>
): Set<string> {
  let result = collapsed
  for (const group of new Set(groups.values())) {
    if (!collapsed.has(group.key) && [...group.sourceKeys].every((key) => collapsed.has(key))) {
      if (result === collapsed) {
        result = new Set(collapsed)
      }
      result.add(group.key)
    }
  }
  return result
}

export function toggleSidebarProjectNameGroup(
  key: string,
  collapsed: ReadonlySet<string>,
  groups: ReadonlyMap<string, SidebarProjectNameGroup>,
  toggle: (key: string) => void
): void {
  const group = [...groups.values()].find((entry) => entry.key === key)
  if (
    group &&
    (collapsed.has(key) || [...group.sourceKeys].every((source) => collapsed.has(source)))
  ) {
    for (const source of new Set([key, ...group.sourceKeys])) {
      if (collapsed.has(source)) {
        toggle(source)
      }
    }
    return
  }
  toggle(key)
}
