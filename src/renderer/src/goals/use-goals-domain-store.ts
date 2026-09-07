import { useStore } from 'zustand'
import { goalDomainStore, type GoalDomainState } from './goals-domain-store'

export function useGoalDomainStore<T>(selector: (state: GoalDomainState) => T): T {
  return useStore(goalDomainStore, selector)
}
