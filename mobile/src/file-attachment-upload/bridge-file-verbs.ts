import { z } from 'zod'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import {
  BRIDGE_MEDIA_HANDLE_MAX_CHARS,
  BRIDGE_MEDIA_MAX_LIVE_HANDLES,
  BRIDGE_MEDIA_MIME_MAX_CHARS
} from '../mobile-web-shell/bridge/bridge-media-verbs'

/**
 * `native.file.pick`: a file of any type, with its name, up to the upload ceiling. Its handles live
 * in the media registry and are read and released through `native.media.read` / `release`, so the
 * session route spends one grant on it: a route's grants are capped at
 * `MOBILE_WEB_BUNDLE_MAX_ROUTE_GRANTS`, and a manifest over the cap is refused whole.
 *
 * A sibling of `native.media.pick` rather than a widening of it, because the media item is a strict
 * shape an older page refuses whole if one member is added.
 */
export const BRIDGE_FILE_VERB_NAMES = ['native.file.pick'] as const

export type BridgeFileVerb = (typeof BRIDGE_FILE_VERB_NAMES)[number]

export function isBridgeFileVerb(verb: string): verb is BridgeFileVerb {
  return BRIDGE_FILE_VERB_NAMES.some((name) => name === verb)
}

/** Long enough for any name a Files provider reports; the host trims it to what it stores. */
export const BRIDGE_FILE_NAME_MAX_CHARS = 1024

export const fileItemSchema = z.strictObject({
  handle: z.string().min(1).max(BRIDGE_MEDIA_HANDLE_MAX_CHARS),
  name: z.string().max(BRIDGE_FILE_NAME_MAX_CHARS),
  mime: z.string().min(1).max(BRIDGE_MEDIA_MIME_MAX_CHARS),
  byteLength: z.number().int().min(0).max(FILE_ATTACHMENT_MAX_BYTES)
})

export type BridgeFileItem = z.infer<typeof fileItemSchema>

export const filePickParamsSchema = z.strictObject({ multiple: z.boolean() })

export const filePickResultSchema = z.strictObject({
  items: z.array(fileItemSchema).max(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
})

export const BRIDGE_FILE_VERBS = {
  'native.file.pick': { params: filePickParamsSchema, result: filePickResultSchema }
} as const
