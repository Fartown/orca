import { describe, expect, it } from 'vitest'
import { isMobileRpcMethodAllowed } from './fork-mobile-rpc-method-allowlist'
import { denyRpcMethodForCaller } from '../rpc/rpc-caller-scope'

describe('isMobileRpcMethodAllowed', () => {
  it('keeps fork uploads admitted by the central mobile scope without widening other access', () => {
    expect(
      denyRpcMethodForCaller({ kind: 'mobile' }, 'fileAttachment.startUpload', 'workspace')
    ).toBeNull()
    expect(
      denyRpcMethodForCaller({ kind: 'mobile' }, 'files.writeBase64Chunk', 'workspace')
    ).not.toBeNull()
    expect(
      denyRpcMethodForCaller(
        { kind: 'ssh-bridge', targetId: 'remote', remoteCliControl: false },
        'fileAttachment.startUpload',
        'workspace'
      )
    ).not.toBeNull()
  })

  it('admits upstream and fork mobile methods and nothing else', () => {
    expect(isMobileRpcMethodAllowed('terminal.send')).toBe(true)
    expect(isMobileRpcMethodAllowed('fileAttachment.startUpload')).toBe(true)
    expect(isMobileRpcMethodAllowed('files.writeBase64Chunk')).toBe(false)
  })
})
