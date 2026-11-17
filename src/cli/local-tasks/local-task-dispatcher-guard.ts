import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import { assertTaskLibraryOpen, type TaskLibraryRpc } from './local-task-cli-library'

export const DISPATCHER_WRITE_REFUSED =
  'The dispatcher writes through proposals only: put this change in orca task propose, and the user confirms it in Orca.'

const DISPATCHER_WATCHES = z.object({ ok: z.literal(true), watches: z.array(z.unknown()) })

/** Whether a pane is the one this host's library knows as the dispatcher's. */
async function isDispatcherPane(rpc: TaskLibraryRpc, paneKey: string): Promise<boolean> {
  try {
    const envelope = await rpc.call('localTasks.dispatcher.watches', { paneKey })
    return DISPATCHER_WATCHES.safeParse(envelope.result).success
  } catch (error) {
    // Why: a host from before the dispatcher has no dispatcher pane to refuse.
    if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
      return false
    }
    throw error
  }
}

/**
 * Refuses a task-library write from the dispatcher's session (REQ-030, H4): it proposes, the user
 * confirms. The host cannot tell which pane a CLI call comes from, so the CLI asks by its own pane.
 */
export async function refuseDispatcherWrite(
  rpc: TaskLibraryRpc,
  paneKey: string | undefined = process.env.ORCA_PANE_KEY
): Promise<void> {
  if (!paneKey) {
    return
  }
  await assertTaskLibraryOpen(rpc, 'write')
  if (await isDispatcherPane(rpc, paneKey)) {
    throw new RuntimeClientError('desktop_only', DISPATCHER_WRITE_REFUSED)
  }
}

/** The same handlers, each refusing to run in the dispatcher's session first. */
export function refusedInDispatcher(
  handlers: Record<string, CommandHandler>
): Record<string, CommandHandler> {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]): [string, CommandHandler] => [
      name,
      async (context) => {
        await refuseDispatcherWrite(context.client)
        return handler(context)
      }
    ])
  )
}
