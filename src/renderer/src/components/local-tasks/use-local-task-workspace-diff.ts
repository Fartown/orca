import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'

export type LocalTaskWorkspaceDiff = {
  files: number
  /** Null when the host sent no line totals for this comparison. */
  added: number | null
  removed: number | null
}

/**
 * What the workspace changed against its base, from what source control already compared. The task
 * page never starts a compare, so a workspace nobody opened shows nothing.
 */
export function useLocalTaskWorkspaceDiff(
  worktreeId: string | null
): LocalTaskWorkspaceDiff | null {
  const [files, added, removed] = useAppStore(
    useShallow((state) => {
      const summary = worktreeId ? state.gitBranchCompareSummaryByWorktree[worktreeId] : null
      if (!worktreeId || summary?.status !== 'ready' || summary.changedFiles === 0) {
        return [0, null, null]
      }
      const total = state.gitBranchLineTotalByWorktree?.[worktreeId]
      // Why the merge base: a total measured against an older fork point is not this comparison's.
      const lines = total && total.mergeBase === summary.mergeBase ? total : null
      return [summary.changedFiles, lines?.added ?? null, lines?.removed ?? null]
    })
  )
  return files > 0 ? { files, added, removed } : null
}
