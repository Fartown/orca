import { FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { translate } from '../i18n/mobile-i18n'
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
    return translate(
      'fileAttachmentUpload.failureToast.tooLarge',
      'File is over {{megabytes}} MB',
      {
        megabytes: megabytes(error.limitBytes)
      }
    )
  }
  if (error instanceof FileAttachmentShellLimitError) {
    return translate(
      'fileAttachmentUpload.failureToast.shellLimit',
      'Update the Orca app to attach files over {{megabytes}} MB',
      { megabytes: megabytes(error.limitBytes) }
    )
  }
  if (error instanceof FileAttachmentHostUpdateRequiredError) {
    return translate(
      'fileAttachmentUpload.failureToast.hostUpdateRequired',
      'Update Orca on your computer to attach files'
    )
  }
  if (connState !== 'connected') {
    return translate(
      'fileAttachmentUpload.failureToast.disconnected',
      'Attach failed (disconnected)'
    )
  }
  if (error instanceof Error && error.message === FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR) {
    return translate(
      'fileAttachmentUpload.failureToast.hostUnavailable',
      'Workspace host is not connected'
    )
  }
  return translate('fileAttachmentUpload.failureToast.attachFailed', 'Attach failed')
}
