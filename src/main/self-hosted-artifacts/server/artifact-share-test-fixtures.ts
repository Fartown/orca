import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { updateArtifactShareConfig } from '../store/artifact-share-config'

export type ArtifactShareSandbox = {
  home: string
  workspace: string
  cleanup: () => Promise<void>
}

export async function createArtifactShareSandbox(): Promise<ArtifactShareSandbox> {
  const root = await mkdtemp(join(tmpdir(), 'orca-artifact-share-server-'))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  await mkdir(join(workspace, 'docs', 'images'), { recursive: true })
  await mkdir(join(workspace, 'site'), { recursive: true })
  await writeFile(
    join(workspace, 'docs', 'plan.md'),
    '# Plan\n\n![a](images/a.png)\n\n</script><b>x</b>'
  )
  await writeFile(join(workspace, 'docs', 'images', 'a.png'), 'png-bytes')
  await writeFile(join(workspace, 'site', 'index.html'), '<h1>site</h1>')
  await writeFile(join(workspace, '.env'), 'SECRET=1')
  return { home, workspace, cleanup: () => rm(root, { recursive: true, force: true }) }
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '0.0.0.0', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

export async function usePreferredPort(home: string, port: number): Promise<void> {
  await updateArtifactShareConfig(home, { preferredPort: port })
}

/** Holds a port with a non-Orca listener so conflict handling can be exercised. */
export async function occupyPort(port: number): Promise<() => Promise<void>> {
  const server = createServer((_request, response) => response.end('someone else'))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve())
  })
  return () => new Promise((resolve) => server.close(() => resolve()))
}

export function fetchLocal(
  port: number,
  path: string,
  method = 'GET'
): Promise<{
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        })
      )
    })
    request.on('error', reject)
    request.end()
  })
}
