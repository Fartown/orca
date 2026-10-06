import { isWindowsAbsolutePathLike } from '../cross-platform-path'

// The five types structured Claude reads as images (`claude-structured-dispatch-content.ts`);
// anything else rides as a file reference so a send cannot fail on `unsupportedType`.
const AGENT_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp'
])

export function isAgentImageAttachmentName(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 && AGENT_IMAGE_EXTENSIONS.has(fileName.slice(dot).toLowerCase())
}

/**
 * Mirrors `shellEscapePath` in `src/renderer/src/components/terminal-pane/pane-helpers.ts`, which
 * mobile cannot import; a parity test compares the two. The rules follow the shell that receives
 * the path, read off the path's own shape, not the phone or this client.
 */
export function escapeFileAttachmentPathForShell(path: string): string {
  if (isWindowsAbsolutePathLike(path)) {
    return /^[a-zA-Z0-9_./@:\\-]+$/.test(path) ? path : `"${path}"`
  }
  if (/^[a-zA-Z0-9_./@:-]+$/.test(path)) {
    return path
  }
  return `'${path.replace(/'/g, "'\\''")}'`
}

/** Typed into a terminal like a desktop drop: escaped, then one space so the next word stays apart. */
export function fileAttachmentTerminalInput(path: string): string {
  return `${escapeFileAttachmentPathForShell(path)} `
}

/**
 * A path as prose for a chat message: bare when it has no space, quoted when it does. Not `@path`:
 * a TUI agent opens its file-mention picker on `@`, and that picker takes the Enter the send ends
 * with, leaving the message parked in the agent's input instead of submitted.
 */
export function fileAttachmentChatPath(path: string): string {
  if (!/[\s"']/.test(path)) {
    return path
  }
  return path.includes('"') ? `'${path}'` : `"${path}"`
}

/** Appends an uploaded file's path to a chat draft, keeping one space on each side of it. */
export function appendFileAttachmentPathToDraft(draft: string, path: string): string {
  const separator = draft.length === 0 || /\s$/.test(draft) ? '' : ' '
  return `${draft}${separator}${fileAttachmentChatPath(path)} `
}
