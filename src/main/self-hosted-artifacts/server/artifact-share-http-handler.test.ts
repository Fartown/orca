import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createArtifactShareOwnerService } from '../artifact-share-owner-service'
import { ArtifactShareAppServer } from './artifact-share-app-server'
import {
  createArtifactShareSandbox,
  fetchLocal,
  findFreePort,
  usePreferredPort,
  type ArtifactShareSandbox
} from './artifact-share-test-fixtures'

let sandbox: ArtifactShareSandbox
let server: ArtifactShareAppServer
let port: number
let token: string

beforeEach(async () => {
  sandbox = await createArtifactShareSandbox()
  port = await findFreePort()
  await usePreferredPort(sandbox.home, port)
  server = new ArtifactShareAppServer({
    home: sandbox.home,
    computerLabel: 'test-computer',
    viewer: null,
    listIpCandidates: async () => ['10.0.0.5']
  })
  await server.setEnabled(true)
  const owner = createArtifactShareOwnerService({
    home: sandbox.home,
    host: { executionHostId: 'local', label: 'test-computer' },
    readStatus: () => server.status()
  })
  const shared = await owner.share({
    workspaceRoot: sandbox.workspace,
    sourcePath: join(sandbox.workspace, 'docs', 'plan.md')
  })
  token = shared.file.workspace?.token ?? ''
  expect(shared.file.url).toBe(`http://10.0.0.5:${port}/${token}/docs/plan.md`)
})

afterEach(async () => {
  await server.stop()
  await sandbox.cleanup()
})

describe('artifact share request handling', () => {
  it('renders markdown as a page that cannot break out of its data element', async () => {
    const page = await fetchLocal(port, `/${token}/docs/plan.md`)
    expect(page.status).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect(page.headers['content-security-policy']).toContain("default-src 'none'")
    expect(page.headers['x-content-type-options']).toBe('nosniff')
    expect(page.body).not.toContain('</script><b>')
    const raw = await fetchLocal(port, `/${token}/docs/plan.md?raw=1`)
    expect(raw.headers['content-type']).toContain('text/plain')
    expect(raw.body).toContain('</script><b>x</b>')
  })

  it('serves relative assets and directory index pages from the live workspace', async () => {
    await expect(fetchLocal(port, `/${token}/docs/images/a.png`)).resolves.toMatchObject({
      status: 200,
      body: 'png-bytes'
    })
    const site = await fetchLocal(port, `/${token}/site/`)
    expect(site.status).toBe(200)
    expect(site.headers['content-type']).toContain('text/html')
    expect(site.headers['content-security-policy']).toBeUndefined()
  })

  it('refuses credentials, escapes, unknown tokens, writes and malformed requests but stays up', async () => {
    for (const path of [
      `/${token}/.env`,
      `/${token}/../workspace/.env`,
      `/${token}/docs/%2e%2e/.env`,
      `/${token}/docs/`,
      '/AAAAAAAAAAAAAAAAAAAAAA/docs/plan.md',
      '/',
      '//',
      '//..%252f..%252f..%252fetc%252fpasswd'
    ]) {
      const response = await fetchLocal(port, path)
      expect([400, 404]).toContain(response.status)
    }
    await expect(fetchLocal(port, `/${token}/docs/plan.md`, 'POST')).resolves.toMatchObject({
      status: 405
    })
    await expect(fetchLocal(port, `/${token}/%E0%A4%A`)).resolves.toMatchObject({ status: 400 })
    await expect(fetchLocal(port, '/_share/identity')).resolves.toMatchObject({ status: 200 })
  })
})
