import { describe, expect, it } from 'vitest'
import { CLIPBOARD_IMAGE_MAX_SOURCE_BYTES } from '../../../src/shared/clipboard/clipboard-image'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { mediaReadParamsSchema } from '../mobile-web-shell/bridge/native-capabilities/bridge-media-verbs'

const HANDLE = 'media-1'

// Why: native.file.pick handles read back through native.media.read, so its offsets reach the
// file upload ceiling instead of stopping at the clipboard-image cap (REQ-004).
describe('how far a picked file may be read', () => {
  it('reads past the clipboard-image cap up to the upload ceiling', () => {
    const past = { handle: HANDLE, offset: CLIPBOARD_IMAGE_MAX_SOURCE_BYTES + 1, length: 16 }
    expect(mediaReadParamsSchema.safeParse(past).success).toBe(true)
    const at = { handle: HANDLE, offset: FILE_ATTACHMENT_MAX_BYTES, length: 16 }
    expect(mediaReadParamsSchema.safeParse(at).success).toBe(true)
  })

  it('refuses an offset past the upload ceiling', () => {
    const past = { handle: HANDLE, offset: FILE_ATTACHMENT_MAX_BYTES + 1, length: 16 }
    expect(mediaReadParamsSchema.safeParse(past).success).toBe(false)
  })
})
