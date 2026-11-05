import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createArtifactShareOwnerService } from '../artifact-share-owner-service'
import { listArtifactShareCommentFiles } from '../store/artifact-share-comments'
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

function postComment(
  path: string,
  comment: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' }
): ReturnType<typeof fetchLocal> {
  return fetchLocal(port, path, 'POST', { headers, body: JSON.stringify(comment) })
}

const COMMENT = { author: '张三', body: '这里写错了', startLine: 1, endLine: 1, quote: 'Plan' }

describe('reader comments on shared Markdown', () => {
  it('keeps comments on the serving computer, outside the workspace, across re-sharing', async () => {
    const created = await postComment(`/_share/comments/${token}/docs/plan.md`, COMMENT)
    expect(created.status).toBe(201)
    expect(JSON.parse(created.body).comment).toMatchObject({ author: '张三', startLine: 1 })

    const page = await fetchLocal(port, `/${token}/docs/plan.md`)
    expect(page.headers['content-security-policy']).toContain("connect-src 'self'")
    expect(readdirSync(join(sandbox.home, 'comments'))).toHaveLength(1)
    expect(existsSync(join(sandbox.workspace, 'comments'))).toBe(false)

    const owner = createArtifactShareOwnerService({
      home: sandbox.home,
      host: { executionHostId: 'local', label: 'test-computer' },
      readStatus: () => server.status()
    })
    await owner.stopWorkspace(token)
    await expect(fetchLocal(port, `/_share/comments/${token}/docs/plan.md`)).resolves.toMatchObject(
      { status: 404 }
    )
    const reshared = await owner.share({
      workspaceRoot: sandbox.workspace,
      sourcePath: join(sandbox.workspace, 'docs', 'plan.md')
    })
    const listed = await fetchLocal(
      port,
      `/_share/comments/${reshared.file.workspace?.token}/docs/plan.md`
    )
    expect(
      JSON.parse(listed.body).comments.map((comment: { body: string }) => comment.body)
    ).toEqual(['这里写错了'])
  })

  it('refuses other sites, non-JSON, oversized, malformed and non-Markdown writes, then rate-limits', async () => {
    const path = `/_share/comments/${token}/docs/plan.md`
    await expect(
      postComment(path, COMMENT, { 'content-type': 'application/json', origin: 'http://evil.test' })
    ).resolves.toMatchObject({ status: 403 })
    await expect(
      postComment(path, COMMENT, {
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site'
      })
    ).resolves.toMatchObject({ status: 403 })
    await expect(
      postComment(path, COMMENT, { 'content-type': 'text/plain' })
    ).resolves.toMatchObject({ status: 415 })
    await expect(
      postComment(path, { ...COMMENT, body: 'x'.repeat(40_000) })
    ).resolves.toMatchObject({ status: 413 })
    await expect(postComment(path, { ...COMMENT, body: ' ' })).resolves.toMatchObject({
      status: 400
    })
    await expect(
      postComment(path, { ...COMMENT, startLine: 3, endLine: 2 })
    ).resolves.toMatchObject({ status: 400 })
    for (const target of [
      `/_share/comments/${token}/docs/images/a.png`,
      `/_share/comments/${token}/.env`,
      '/_share/comments/AAAAAAAAAAAAAAAAAAAAAA/docs/plan.md'
    ]) {
      await expect(postComment(target, COMMENT)).resolves.toMatchObject({ status: 404 })
    }
    await expect(fetchLocal(port, path, 'PUT')).resolves.toMatchObject({ status: 405 })
    await expect(fetchLocal(port, path, 'DELETE')).resolves.toMatchObject({ status: 400 })

    const statuses: number[] = []
    for (let index = 0; index < 25; index += 1) {
      statuses.push((await postComment(path, COMMENT)).status)
    }
    expect(statuses.filter((status) => status === 201).length).toBeLessThan(25)
    expect(statuses.at(-1)).toBe(429)
    await expect(fetchLocal(port, '/_share/identity')).resolves.toMatchObject({ status: 200 })
  })

  it('stores a blank name as anonymous and lets only the writing browser edit or delete', async () => {
    const path = `/_share/comments/${token}/docs/plan.md`
    const created = JSON.parse((await postComment(path, { ...COMMENT, author: ' ' })).body)
    expect(created.comment).not.toHaveProperty('author')
    const own = (method: string, editToken: string, body?: unknown) =>
      fetchLocal(port, `${path}?id=${created.comment.id}`, method, {
        headers: {
          'x-orca-comment-token': editToken,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })

    await expect(own('PATCH', 'not-the-token', { body: '改' })).resolves.toMatchObject({
      status: 403
    })
    await expect(own('DELETE', 'not-the-token')).resolves.toMatchObject({ status: 403 })
    const edited = await own('PATCH', created.editToken, { body: '改过了' })
    expect(edited.status).toBe(200)
    expect(JSON.parse(edited.body).comment).toMatchObject({
      body: '改过了',
      updatedAt: expect.any(String)
    })
    const commentsDir = join(sandbox.home, 'comments')
    for (const name of readdirSync(commentsDir)) {
      expect(readFileSync(join(commentsDir, name), 'utf8')).not.toContain(created.editToken)
    }

    await expect(own('DELETE', created.editToken)).resolves.toMatchObject({ status: 200 })
    await expect(own('DELETE', created.editToken)).resolves.toMatchObject({ status: 404 })
    const listed = JSON.parse((await fetchLocal(port, path)).body)
    expect(listed.comments).toEqual([])
    const [file] = listArtifactShareCommentFiles(sandbox.home)
    expect(file?.deletedIds).toEqual([created.comment.id])
  })
})
