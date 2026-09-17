import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import { docPreviewContentType } from '../../browser/doc-preview-file-reader'
import { readArtifactShareWorkspaces } from '../store/artifact-share-records'
import {
  ARTIFACT_SHARE_MARKDOWN_PAGE_CSP,
  buildArtifactShareMarkdownPage
} from './artifact-share-markdown-page'
import {
  parseArtifactShareRequest,
  resolveArtifactShareRequestFile
} from './artifact-share-request-path'
import type { ArtifactShareViewerAssets } from './artifact-share-viewer-assets'
import { ARTIFACT_SHARE_PROTOCOL, ARTIFACT_SHARE_SERVICE_NAME } from './artifact-share-identity'

// Why: past this size the rendered page would embed megabytes of JSON; the raw file still streams.
const MARKDOWN_PAGE_MAX_BYTES = 20 * 1024 * 1024
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

export type ArtifactShareRequestLogEntry = {
  category: 'page' | 'file' | 'asset' | 'identity' | 'refused' | 'error'
  status: number
  durationMs: number
}
export type ArtifactShareRequestLog = (entry: ArtifactShareRequestLogEntry) => void

export type ArtifactShareHandlerOptions = {
  home: string
  instance: string
  computerLabel: string
  viewer: ArtifactShareViewerAssets | null
  log?: ArtifactShareRequestLog
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.setHeader('Content-Security-Policy', "default-src 'none'")
  response.end(body)
}

function sendBody(
  request: IncomingMessage,
  response: ServerResponse,
  contentType: string,
  body: string | Buffer
): void {
  response.statusCode = 200
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(request.method === 'HEAD' ? undefined : body)
}

function streamFile(
  request: IncomingMessage,
  response: ServerResponse,
  input: { absolutePath: string; size: number; contentType: string; cacheControl: string }
): void {
  response.statusCode = 200
  response.setHeader('Content-Type', input.contentType)
  response.setHeader('Content-Length', input.size)
  response.setHeader('Cache-Control', input.cacheControl)
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(input.absolutePath)
  stream.on('error', () =>
    response.headersSent ? response.destroy() : sendText(response, 500, 'Error')
  )
  stream.pipe(response)
}

async function handle(
  options: ArtifactShareHandlerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<Omit<ArtifactShareRequestLogEntry, 'durationMs'>> {
  setCommonHeaders(response)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    sendText(response, 405, 'Method Not Allowed')
    return { category: 'refused', status: 405 }
  }
  const target = parseArtifactShareRequest(request.url)
  if (target.kind === 'bad-request') {
    sendText(response, 400, 'Bad Request')
    return { category: 'refused', status: 400 }
  }
  if (target.kind === 'identity') {
    response.setHeader('Cache-Control', 'no-store')
    sendBody(
      request,
      response,
      'application/json; charset=utf-8',
      JSON.stringify({
        service: ARTIFACT_SHARE_SERVICE_NAME,
        protocol: ARTIFACT_SHARE_PROTOCOL,
        instance: options.instance
      })
    )
    return { category: 'identity', status: 200 }
  }
  if (target.kind === 'asset' && options.viewer) {
    const absolutePath = join(options.viewer.directory, target.name)
    const assetStat = await stat(absolutePath).catch(() => null)
    if (assetStat?.isFile()) {
      streamFile(request, response, {
        absolutePath,
        size: assetStat.size,
        contentType: docPreviewContentType(target.name),
        cacheControl: 'public, max-age=31536000, immutable'
      })
      return { category: 'asset', status: 200 }
    }
  }
  if (target.kind !== 'file') {
    sendText(response, 404, 'Not Found')
    return { category: 'refused', status: 404 }
  }
  const workspace = readArtifactShareWorkspaces(options.home).find(
    (candidate) => candidate.token === target.token
  )
  const file = workspace
    ? await resolveArtifactShareRequestFile(workspace.rootPath, target.segments)
    : null
  if (!file) {
    sendText(response, 404, 'Not Found')
    return { category: 'refused', status: 404 }
  }
  const isMarkdown = MARKDOWN_EXTENSIONS.has(extname(file.absolutePath).toLowerCase())
  if (isMarkdown && !target.raw && file.size <= MARKDOWN_PAGE_MAX_BYTES) {
    const markdown = await readFile(file.absolutePath, 'utf8')
    response.setHeader('Content-Security-Policy', ARTIFACT_SHARE_MARKDOWN_PAGE_CSP)
    response.setHeader('Cache-Control', 'no-cache')
    sendBody(
      request,
      response,
      'text/html; charset=utf-8',
      buildArtifactShareMarkdownPage({
        relativePath: file.relativePath,
        markdown,
        computerLabel: options.computerLabel,
        viewer: options.viewer
      })
    )
    return { category: 'page', status: 200 }
  }
  streamFile(request, response, {
    absolutePath: file.absolutePath,
    size: file.size,
    contentType: docPreviewContentType(file.absolutePath),
    cacheControl: 'no-cache'
  })
  return { category: 'file', status: 200 }
}

/** Read-only static handler: every failure is contained to its own request. */
export function createArtifactShareRequestHandler(
  options: ArtifactShareHandlerOptions
): RequestListener {
  return (request, response) => {
    const startedAt = Date.now()
    handle(options, request, response)
      .then((entry) => options.log?.({ ...entry, durationMs: Date.now() - startedAt }))
      .catch(() => {
        if (!response.headersSent) {
          sendText(response, 500, 'Internal Server Error')
        } else {
          response.destroy()
        }
        options.log?.({ category: 'error', status: 500, durationMs: Date.now() - startedAt })
      })
  }
}
