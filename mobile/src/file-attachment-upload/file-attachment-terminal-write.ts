import { separateImagePasteFromFollowingText } from '../../../src/shared/image-paste-following-text'
import {
  fileAttachmentTerminalInput,
  isAgentImageAttachmentName
} from '../../../src/shared/file-attachment-upload/file-attachment-delivery-text'
import { buildMobileImagePastePayload } from '../session/mobile-clipboard-image'
import { nativeChatTerminalWrite } from '../session/mobile-session-write-operations'

export type FileAttachmentTerminalWriter = Parameters<typeof nativeChatTerminalWrite.request>[0]

export type WriteAttachmentToTerminalArgs = {
  readonly client: FileAttachmentTerminalWriter
  readonly terminal: string
  readonly agent?: string | null
  readonly deviceToken: string | null
  readonly path: string
  readonly fileName: string
  readonly beforeTerminalSend?: (terminal: string) => Promise<boolean>
}

/**
 * The text an uploaded file becomes in a terminal: an image the agent attaches is pasted exactly
 * like a photo, and any other file is typed like a desktop drop, escaped for the host's shell.
 */
export function fileAttachmentTerminalText(
  path: string,
  fileName: string,
  agent?: string | null
): string {
  if (isAgentImageAttachmentName(fileName)) {
    return separateImagePasteFromFollowingText(buildMobileImagePastePayload(path, agent), true)
  }
  return fileAttachmentTerminalInput(path)
}

/** False when the terminal input gate refused, or the host did not accept the write. */
export async function writeAttachmentToTerminal(
  args: WriteAttachmentToTerminalArgs
): Promise<boolean> {
  if (args.beforeTerminalSend && !(await args.beforeTerminalSend(args.terminal))) {
    return false
  }
  const response = await nativeChatTerminalWrite.request(args.client, {
    terminal: args.terminal,
    text: fileAttachmentTerminalText(args.path, args.fileName, args.agent),
    enter: false,
    ...(args.deviceToken ? { client: { id: args.deviceToken, type: 'mobile' as const } } : {})
  })
  return nativeChatTerminalWrite.interpret(response) === true
}
