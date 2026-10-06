import { describe, expect, it } from 'vitest'
import { shellEscapePath } from '../components/terminal-pane/pane-helpers'
import { escapeFileAttachmentPathForShell } from '../../../shared/file-attachment-upload/file-attachment-delivery-text'

// Mobile types an uploaded path into a terminal with its own copy of the desktop drop escaping,
// because it cannot import the renderer. This keeps the two from drifting apart.
const POSIX_PATHS = [
  '/tmp/orca-file-attachments/1/report.pdf',
  "/tmp/a b/it's here.zip",
  '/var/folders/x/T/orca-file-attachments-501/1/季度报告.pdf',
  '/tmp/$(rm -rf ~).txt'
]
const WINDOWS_PATHS = ['C:\\Users\\me\\AppData\\Local\\Temp\\report.pdf', 'C:\\Temp\\a b.zip']

describe('escapeFileAttachmentPathForShell', () => {
  it('matches the desktop drop escaping for the shell the path belongs to', () => {
    for (const path of POSIX_PATHS) {
      expect(escapeFileAttachmentPathForShell(path)).toBe(shellEscapePath(path, 'posix'))
    }
    for (const path of WINDOWS_PATHS) {
      expect(escapeFileAttachmentPathForShell(path)).toBe(shellEscapePath(path, 'windows'))
    }
  })
})
