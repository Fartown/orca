import type { IssueSummary } from '../../../../shared/issues/types'
import { issueDomainStore } from '@/issues/issues-domain-store'

export function IssueChildren({
  route,
  issues
}: {
  route: 'local' | `ssh:${string}` | `runtime:${string}`
  issues: IssueSummary[]
}): React.JSX.Element | null {
  if (issues.length === 0) {
    return null
  }
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Child Issues
      </h2>
      <div className="divide-y divide-border rounded-md border border-border">
        {issues.map((child) => (
          <button
            key={child.id}
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={() =>
              issueDomainStore.getState().setActiveIssueRoute({
                routeExecutionHostId: route,
                issueId: child.id
              })
            }
          >
            <span className="min-w-0 flex-1 truncate">
              {child.source.kind === 'local' ? child.localTitle : child.source.titleSnapshot}
            </span>
            {child.ownUnresolvedCount > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {child.ownUnresolvedCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  )
}
