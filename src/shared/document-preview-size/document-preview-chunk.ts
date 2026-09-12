import { z } from 'zod'
import { MAX_FILE_RANGE_READ_BYTES } from '../file-range-read'

export const DocumentPreviewChunkRequest = z.object({
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive().max(MAX_FILE_RANGE_READ_BYTES),
  version: z.string().optional()
})

export type DocumentPreviewChunkRequest = z.infer<typeof DocumentPreviewChunkRequest>
export type DocumentPreviewChunkMetadata = {
  offset: number
  totalBytes: number
  version: string
}
