import { FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import type { ConnectionState } from '../transport/types'
import {
  FileAttachmentHostUpdateRequiredError,
  FileAttachmentShellLimitError,
  FileAttachmentTooLargeError
} from './picked-attachment-file'

function megabytes(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024))
}

/** One line the session toast can show for a failed attach; the host's own words never reach it. */
export function fileAttachmentFailureToast(error: unknown, connState: ConnectionState): string {
  if (error instanceof FileAttachmentTooLargeError) {
    return `File is over ${megabytes(error.limitBytes)} MB`
  }
  if (error instanceof FileAttachmentShellLimitError) {
    return `Update the Orca app to attach files over ${megabytes(error.limitBytes)} MB`
  }
  if (error instanceof FileAttachmentHostUpdateRequiredError) {
    return 'Update Orca on your computer to attach files'
  }
  if (connState !== 'connected') {
    return 'Attach failed (disconnected)'
  }
  if (error instanceof Error && error.message === FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR) {
    return 'Workspace host is not connected'
  }
  return 'Attach failed'
}
