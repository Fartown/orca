import { z } from 'zod'

export const SHARE_DOCUMENT_ELEMENT_ID = 'orca-share-document'
export const SHARE_ROOT_ELEMENT_ID = 'orca-share-root'

const ShareDocument = z.object({
  title: z.string(),
  relativePath: z.string(),
  markdown: z.string(),
  computer: z.string()
})
export type ShareDocument = z.infer<typeof ShareDocument>

export function readShareDocument(doc: Document): ShareDocument | null {
  const element = doc.getElementById(SHARE_DOCUMENT_ELEMENT_ID)
  if (!element?.textContent) {
    return null
  }
  try {
    const parsed = ShareDocument.safeParse(JSON.parse(element.textContent))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Local links name a path on the sharer's disk; on the share page they would only mislead. */
export function isShareViewerLocalHref(href: string | undefined): boolean {
  return typeof href === 'string' && /^file:/i.test(href.trim())
}
