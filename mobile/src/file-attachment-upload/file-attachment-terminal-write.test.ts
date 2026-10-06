import { describe, expect, it } from 'vitest'
import { fileAttachmentFailureToast } from './file-attachment-failure-toast'
import { fileAttachmentTerminalText } from './file-attachment-terminal-write'
import {
  FileAttachmentHostUpdateRequiredError,
  FileAttachmentShellLimitError,
  FileAttachmentTooLargeError
} from './picked-attachment-file'

describe('fileAttachmentTerminalText', () => {
  it('pastes an agent-readable image like a photo', () => {
    expect(fileAttachmentTerminalText('/tmp/x/shot.png', 'shot.png', 'claude')).toBe(
      '\x1b[200~/tmp/x/shot.png\x1b[201~ '
    )
  })

  it('types any other file escaped for the host shell', () => {
    expect(fileAttachmentTerminalText('/tmp/x/my report.pdf', 'my report.pdf', 'claude')).toBe(
      "'/tmp/x/my report.pdf' "
    )
    expect(fileAttachmentTerminalText('C:\\T\\a b.zip', 'a b.zip', null)).toBe('"C:\\T\\a b.zip" ')
  })
})

describe('fileAttachmentFailureToast', () => {
  it('names each refusal the user can act on', () => {
    expect(
      fileAttachmentFailureToast(new FileAttachmentTooLargeError(100 * 1024 * 1024), 'connected')
    ).toBe('File is over 100 MB')
    expect(
      fileAttachmentFailureToast(new FileAttachmentShellLimitError(18 * 1024 * 1024), 'connected')
    ).toBe('Update the Orca app to attach files over 18 MB')
    expect(
      fileAttachmentFailureToast(new FileAttachmentHostUpdateRequiredError(), 'connected')
    ).toBe('Update Orca on your computer to attach files')
    expect(
      fileAttachmentFailureToast(new Error('The workspace host is not connected'), 'connected')
    ).toBe('Workspace host is not connected')
    expect(fileAttachmentFailureToast(new Error('x'), 'disconnected')).toBe(
      'Attach failed (disconnected)'
    )
    expect(fileAttachmentFailureToast(new Error('x'), 'connected')).toBe('Attach failed')
  })
})
