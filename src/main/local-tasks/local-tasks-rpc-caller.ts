import type { LocalTaskEventSource } from '../../shared/local-tasks/local-task-types'
import type { RpcContext } from '../runtime/rpc/core'

type CallerContext = Pick<RpcContext, 'clientKind' | 'caller'>

/** Activity names who made a change; the transport, never the params, says who that is. */
export function sourceOf(context: CallerContext): LocalTaskEventSource {
  if (context.clientKind === 'mobile') {
    return 'mobile'
  }
  return context.caller?.kind === 'desktop' || context.caller?.kind === 'paired-device'
    ? 'desktop'
    : 'cli'
}

/**
 * Anyone but a phone: this host's own renderer (`desktop`), a paired desktop or LAN browser
 * (`paired-device` without the mobile client kind), or the CLI. The transport stamps both fields
 * (src/main/runtime/rpc/rpc-caller-identity.ts); a phone relayed by its desktop stays `mobile`.
 */
export function isDesktopClientCaller(context: CallerContext): boolean {
  return context.clientKind !== 'mobile'
}
