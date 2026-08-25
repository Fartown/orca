import { Button } from '@/components/ui/button'
import type { IssueRouteExecutionHostId, RoundRecordPreview } from '../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'

export function IssueTimeline({
  route,
  rounds,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  rounds: RoundRecordPreview[]
  onChanged(): void
}): React.JSX.Element | null {
  if (rounds.length === 0) {
    return null
  }
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Timeline
      </h2>
      <div className="space-y-2">
        {rounds.map((round) => (
          <article key={round.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {round.kind === 'waiting' ? 'Waiting' : 'Completed'}
              </span>
              <span className="text-xs text-muted-foreground">
                {round.agentOutput.completeness}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(round.occurredAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              {round.pendingQuestion.text ?? round.agentOutput.text ?? 'Preview not captured'}
            </p>
            <div className="mt-2 flex justify-end gap-1">
              {round.readAt === null ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void mutateRound(route, 'issues.markRead', round.id, onChanged)}
                >
                  Mark read
                </Button>
              ) : null}
              {round.resolvedAt === null ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    void mutateRound(route, 'issues.resolveRound', round.id, onChanged)
                  }
                >
                  Mark handled
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

async function mutateRound(
  route: IssueRouteExecutionHostId,
  method: 'issues.markRead' | 'issues.resolveRound',
  roundId: string,
  onChanged: () => void
): Promise<void> {
  await IssueRuntimeClient.forRoute(route).mutate(method, {
    mutationId: crypto.randomUUID(),
    roundId
  })
  onChanged()
}
