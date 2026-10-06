import { z } from 'zod'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import {
  BRIDGE_MEDIA_HANDLE_MAX_CHARS,
  BRIDGE_MEDIA_MAX_LIVE_HANDLES,
  BRIDGE_MEDIA_MIME_MAX_CHARS,
  BRIDGE_MEDIA_READ_MAX_BYTES,
  mediaReadResultSchema,
  mediaReleaseParamsSchema,
  mediaReleaseResultSchema
} from '../mobile-web-shell/bridge/bridge-media-verbs'

/**
 * `native.file.pick` / `read` / `release`: a file of any type, with its name, up to the upload
 * ceiling. A sibling of `native.media.*` rather than a widening of it, because the media item is
 * a strict shape that an older page refuses whole if one member is added, and its offsets are
 * capped at the image ceiling.
 */
export const BRIDGE_FILE_VERB_NAMES = [
  'native.file.pick',
  'native.file.read',
  'native.file.release'
] as const

export type BridgeFileVerb = (typeof BRIDGE_FILE_VERB_NAMES)[number]

export function isBridgeFileVerb(verb: string): verb is BridgeFileVerb {
  return BRIDGE_FILE_VERB_NAMES.some((name) => name === verb)
}

/** Long enough for any name a Files provider reports; the host trims it to what it stores. */
export const BRIDGE_FILE_NAME_MAX_CHARS = 1024

const handleSchema = z.string().min(1).max(BRIDGE_MEDIA_HANDLE_MAX_CHARS)
const byteOffsetSchema = z.number().int().min(0).max(FILE_ATTACHMENT_MAX_BYTES)

export const fileItemSchema = z.strictObject({
  handle: handleSchema,
  name: z.string().max(BRIDGE_FILE_NAME_MAX_CHARS),
  mime: z.string().min(1).max(BRIDGE_MEDIA_MIME_MAX_CHARS),
  byteLength: byteOffsetSchema
})

export type BridgeFileItem = z.infer<typeof fileItemSchema>

export const filePickParamsSchema = z.strictObject({ multiple: z.boolean() })

export const filePickResultSchema = z.strictObject({
  items: z.array(fileItemSchema).max(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
})

export const fileReadParamsSchema = z.strictObject({
  handle: handleSchema,
  offset: byteOffsetSchema,
  length: z.number().int().min(1).max(BRIDGE_MEDIA_READ_MAX_BYTES)
})

export const fileReadResultSchema = mediaReadResultSchema
export const fileReleaseParamsSchema = mediaReleaseParamsSchema
export const fileReleaseResultSchema = mediaReleaseResultSchema

export const BRIDGE_FILE_VERBS = {
  'native.file.pick': { params: filePickParamsSchema, result: filePickResultSchema },
  'native.file.read': { params: fileReadParamsSchema, result: fileReadResultSchema },
  'native.file.release': { params: fileReleaseParamsSchema, result: fileReleaseResultSchema }
} as const
