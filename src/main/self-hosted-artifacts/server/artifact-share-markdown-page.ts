import { basename } from 'node:path'
import type { ArtifactShareViewerAssets } from './artifact-share-viewer-assets'

export const ARTIFACT_SHARE_DOCUMENT_ELEMENT_ID = 'orca-share-document'
export const ARTIFACT_SHARE_ROOT_ELEMENT_ID = 'orca-share-root'

export const ARTIFACT_SHARE_MARKDOWN_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: http: https:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** JSON inside a script element must not be able to close the element or break a JS parser. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function buildArtifactShareMarkdownPage(input: {
  relativePath: string
  markdown: string
  computerLabel: string
  viewer: ArtifactShareViewerAssets | null
}): string {
  const title = escapeHtml(basename(input.relativePath))
  const fallback = `<pre class="orca-share-fallback">${escapeHtml(input.markdown)}</pre>`
  if (!input.viewer) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body>${fallback}</body></html>`
  }
  const documentJson = embedJson({
    title: basename(input.relativePath),
    relativePath: input.relativePath,
    markdown: input.markdown,
    computer: input.computerLabel
  })
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/_share/assets/${input.viewer.style}">
<script id="${ARTIFACT_SHARE_DOCUMENT_ELEMENT_ID}" type="application/json">${documentJson}</script>
<script src="/_share/assets/${input.viewer.script}" defer></script>
</head>
<body>
<div id="${ARTIFACT_SHARE_ROOT_ELEMENT_ID}"><noscript>${fallback}</noscript></div>
</body>
</html>`
}
