import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  createTabEntryAbsolutePathHostPolicySelector,
  toTabEntryAbsolutePathContext,
  type TabEntryAbsolutePathContext
} from './absolute-path-host-policy'

/**
 * Classifier context for absolute paths in the tab create entry, derived from the owning host.
 * Owner resolution only runs while `enabled` (the query looks like an absolute path).
 */
export function useTabEntryAbsolutePathContext(
  worktreeId: string,
  enabled: boolean
): TabEntryAbsolutePathContext {
  const policySelector = useMemo(
    () => createTabEntryAbsolutePathHostPolicySelector(worktreeId, { skip: !enabled }),
    [enabled, worktreeId]
  )
  const policy = useAppStore(policySelector)
  return useMemo(() => toTabEntryAbsolutePathContext(policy), [policy])
}
