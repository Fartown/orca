// The name an uploaded file is written under on the workspace host, which may be Windows even when
// the phone and this client are not, so the rules are the strictest of the three platforms.

const MAX_NAME_UTF8_BYTES = 120
const MAX_KEPT_EXTENSION_CHARS = 16
const FALLBACK_STEM = 'attachment'
const FALLBACK_EXTENSION = '.bin'

// oxlint-disable-next-line no-control-regex -- control characters are exactly what this strips
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\\/:*?"<>|]/g
// Windows reserves these names before the first dot (`nul.tar.gz` too), trailing spaces aside.
const WINDOWS_RESERVED_BASE = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³]) *$/i

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/gzip': '.gz',
  'application/x-gzip': '.gz',
  'application/x-tar': '.tar',
  'application/x-7z-compressed': '.7z',
  'application/vnd.rar': '.rar',
  'application/json': '.json',
  'application/xml': '.xml',
  'application/x-yaml': '.yaml',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'text/html': '.html',
  'text/xml': '.xml',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3'
}

export function fileAttachmentExtensionForMime(mimeType: string | undefined): string | null {
  if (!mimeType) {
    return null
  }
  const essence = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return EXTENSION_BY_MIME[essence] ?? null
}

function splitExtension(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf('.')
  // A leading dot is a hidden file's name, not an extension.
  if (dot <= 0 || name.length - dot > MAX_KEPT_EXTENSION_CHARS + 1) {
    return { stem: name, extension: '' }
  }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(value).byteLength <= maxBytes) {
    return value
  }
  let result = ''
  let used = 0
  for (const character of value) {
    const size = encoder.encode(character).byteLength
    if (used + size > maxBytes) {
      break
    }
    result += character
    used += size
  }
  return result
}

/** A single path segment that is safe to create on POSIX and Windows hosts alike. */
export function sanitizeFileAttachmentName(rawName: string, mimeType?: string): string {
  const baseName = rawName.split(/[\\/]/).pop() ?? ''
  const cleaned = baseName
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '_')
    .replace(/^\s+/, '')
    .replace(/[\s.]+$/, '')
  const mimeExtension = fileAttachmentExtensionForMime(mimeType)
  if (cleaned.length === 0 || /^\.+$/.test(cleaned)) {
    return `${FALLBACK_STEM}${mimeExtension ?? FALLBACK_EXTENSION}`
  }
  let { stem, extension } = splitExtension(cleaned)
  if (!extension && mimeExtension) {
    extension = mimeExtension
  }
  if (WINDOWS_RESERVED_BASE.test(stem.split('.')[0] ?? '')) {
    stem = `_${stem}`
  }
  const extensionBytes = new TextEncoder().encode(extension).byteLength
  const truncatedStem = truncateUtf8(stem, MAX_NAME_UTF8_BYTES - extensionBytes).replace(
    /[\s.]+$/,
    ''
  )
  return `${truncatedStem || FALLBACK_STEM}${extension}`
}
