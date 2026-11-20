import { MOBILE_RPC_METHOD_ALLOWLIST } from '../runtime/rpc/server/runtime-rpc-mobile-method-allowlist'
import { MOBILE_RPC_METHOD_ROUTES } from '../runtime/rpc/server/runtime-rpc-mobile-method-routing'
import {
  FORK_MOBILE_RPC_METHOD_ALLOWLIST,
  isForkExecutionHostRelayMethod
} from '../runtime/rpc/server/fork-mobile-rpc-method-allowlist'

/**
 * Whether a phone request tagged for a server stays on the paired desktop. Fork methods keep that
 * default unless they are task library relays, which each Orca answers for itself (D-008).
 */
export function staysOnPairedDesktop(method: string): boolean {
  return (
    MOBILE_RPC_METHOD_ROUTES.get(method) === 'paired-desktop' ||
    (FORK_MOBILE_RPC_METHOD_ALLOWLIST.has(method) && !isForkExecutionHostRelayMethod(method))
  )
}

/** Methods the relay entry admits: upstream's mobile allowlist plus the task library relays. */
export function relayAdmits(method: string): boolean {
  return MOBILE_RPC_METHOD_ALLOWLIST.has(method) || isForkExecutionHostRelayMethod(method)
}
