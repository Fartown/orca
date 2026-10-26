import { normalizeLocalTaskPrefix } from '../../../shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { Project } from '../../../shared/project-types'

const PREFIX_MAX = 10
const FALLBACK_PREFIX = 'TASK'

/** Every prefix a new project may not take: current ones and every project's earlier ones. */
export function takenLocalTaskPrefixes(projects: readonly LocalTaskProject[]): Set<string> {
  return new Set(projects.flatMap((project) => [project.prefix, ...project.aliases]))
}

/**
 * `shop` → `SHOP`, `refund-webhook` → `RW`; names without ASCII letters fall back to `TASK`.
 * A taken prefix gets a number: `SHOP2`.
 */
export function suggestLocalTaskPrefix(name: string, taken: ReadonlySet<string>): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const initials = words.map((word) => word[0]).join('')
  const raw = words.length > 1 && initials.length >= 2 ? initials : (words[0] ?? '')
  const base = normalizeLocalTaskPrefix(raw.slice(0, 4)) ?? FALLBACK_PREFIX
  let candidate = base
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    const digits = String(suffix)
    candidate = `${base.slice(0, PREFIX_MAX - digits.length)}${digits}`
  }
  return candidate
}

export type LocalTaskProjectRecommendation = { project: Project; prefix: string }

/** Orca projects that have no task project yet, each with a prefix no other row or project uses. */
export function recommendLocalTaskProjects(
  orcaProjects: readonly Project[],
  taskProjects: readonly LocalTaskProject[]
): LocalTaskProjectRecommendation[] {
  const linked = new Set(taskProjects.map((project) => project.orcaProjectId))
  const taken = takenLocalTaskPrefixes(taskProjects)
  const recommendations: LocalTaskProjectRecommendation[] = []
  for (const project of orcaProjects) {
    if (linked.has(project.id)) {
      continue
    }
    const prefix = suggestLocalTaskPrefix(project.displayName, taken)
    taken.add(prefix)
    recommendations.push({ project, prefix })
  }
  return recommendations
}
