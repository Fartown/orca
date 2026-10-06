import { describe, expect, it } from 'vitest'
import { isMobileRpcMethodAllowed } from './fork-mobile-rpc-method-allowlist'

describe('isMobileRpcMethodAllowed', () => {
  it('admits upstream and fork mobile methods and nothing else', () => {
    expect(isMobileRpcMethodAllowed('terminal.send')).toBe(true)
    expect(isMobileRpcMethodAllowed('fileAttachment.startUpload')).toBe(true)
    expect(isMobileRpcMethodAllowed('files.writeBase64Chunk')).toBe(false)
  })
})
