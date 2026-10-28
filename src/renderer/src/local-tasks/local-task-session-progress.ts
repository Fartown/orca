import type {
  LocalTaskSessionLink,
  LocalTaskSessionProgress
} from '../../../shared/local-tasks/local-task-link-types'
import { useLocalTasksDomain, type LocalTasksDomainState } from './local-tasks-domain-store'

/**
 * A linked session as its library's host judged it (`attention.get`, CONTRACT §5); a library out
 * of contact reads unverifiable. Null until the host answered.
 */
export function selectLocalTaskSessionProgress(
  state: Pick<LocalTasksDomainState, 'progress'>,
  link: Pick<LocalTaskSessionLink, 'id'>
): LocalTaskSessionProgress | null {
  return state.progress?.sessions.get(link.id) ?? null
}

export function useLocalTaskSessionProgress(
  link: LocalTaskSessionLink | null
): LocalTaskSessionProgress | null {
  return useLocalTasksDomain((state) => (link ? selectLocalTaskSessionProgress(state, link) : null))
}
