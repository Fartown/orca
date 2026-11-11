import { Laptop, Server, Unplug } from 'lucide-react'
import { useAppStore } from '@/store'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import { cn } from '@/lib/utils'
import { normalizeExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'

/** A host's display name (the user's rename first); the snapshot or raw id when this window has none. */
export function useLocalTaskHostLabel(
  hostId: string | null,
  fallback: string | null = null
): string {
  const label = useAppStore((state) => {
    const id = hostId ? normalizeExecutionHostId(hostId) : null
    return id ? selectLocalTaskHostLabel(state, id) : null
  })
  return label ?? fallback ?? hostId ?? ''
}

/** This machine, another host, or a host out of contact. */
export function LocalTaskHostIcon({
  hostId,
  inContact,
  className
}: {
  hostId: string | null
  inContact: boolean
  className?: string
}): React.JSX.Element {
  const Icon = !inContact
    ? Unplug
    : parseExecutionHostId(hostId)?.kind === 'local'
      ? Laptop
      : Server
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} />
}
