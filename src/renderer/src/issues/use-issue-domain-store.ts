import { useStore } from 'zustand'
import { issueDomainStore, type IssueDomainState } from './issues-domain-store'

export function useIssueDomainStore<T>(selector: (state: IssueDomainState) => T): T {
  return useStore(issueDomainStore, selector)
}
