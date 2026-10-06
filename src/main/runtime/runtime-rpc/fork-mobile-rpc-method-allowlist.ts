import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'

/**
 * Mobile-callable methods that fork features add. Kept out of the upstream list, which sits at the
 * max-lines ceiling and would conflict on every upstream sync; `mobile-rpc-allowlist.test.ts`
 * reads both.
 */
export const FORK_MOBILE_RPC_METHOD_ALLOWLIST = new Set([
  'fileAttachment.abortUpload',
  'fileAttachment.appendUploadChunk',
  'fileAttachment.commitUpload',
  'fileAttachment.startUpload'
])

export function isMobileRpcMethodAllowed(method: string): boolean {
  return MOBILE_RPC_METHOD_ALLOWLIST.has(method) || FORK_MOBILE_RPC_METHOD_ALLOWLIST.has(method)
}
