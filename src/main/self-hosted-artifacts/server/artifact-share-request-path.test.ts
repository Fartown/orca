import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveArtifactShareOwnerTarget } from '../artifact-share-owner-paths'
import {
  parseArtifactShareRequest,
  resolveArtifactShareRequestFile
} from './artifact-share-request-path'

const TOKEN = 'Kq3vT0aZ9bXy7Wm2Lp4Rs1'
let sandbox: string
let root: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'orca-artifact-share-paths-'))
  root = join(sandbox, 'workspace')
  await mkdir(join(root, 'docs', 'images'), { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await mkdir(join(root, 'site'), { recursive: true })
  await writeFile(join(root, 'docs', 'plan.md'), '# plan')
  await writeFile(join(root, 'docs', 'images', 'a.png'), 'png')
  await writeFile(join(root, '.git', 'config'), 'secret')
  await writeFile(join(root, '.env'), 'TOKEN=1')
  await writeFile(join(root, 'site', 'index.html'), '<h1>site</h1>')
  await writeFile(join(sandbox, 'outside.txt'), 'outside')
  await symlink(join(sandbox, 'outside.txt'), join(root, 'docs', 'escape.txt'))
  await symlink(join(root, '.env'), join(root, 'docs', 'env-alias.txt'))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('parseArtifactShareRequest', () => {
  it('parses files, raw markdown, assets and identity', () => {
    expect(parseArtifactShareRequest(`/${TOKEN}/docs/plan.md?raw=1`)).toEqual({
      kind: 'file',
      token: TOKEN,
      segments: ['docs', 'plan.md'],
      raw: true
    })
    expect(parseArtifactShareRequest(`/${TOKEN}/docs/%E8%B0%83%E7%A0%94.md`)).toMatchObject({
      segments: ['docs', '调研.md']
    })
    expect(parseArtifactShareRequest('/_share/identity')).toEqual({ kind: 'identity' })
    expect(parseArtifactShareRequest('/_share/assets/viewer.1a2b.js')).toEqual({
      kind: 'asset',
      name: 'viewer.1a2b.js'
    })
  })

  it('rejects escapes, malformed encodings and unknown prefixes without throwing', () => {
    for (const url of [
      '//',
      '//..%252f..%252f..%252fetc%252fpasswd',
      `/${TOKEN}/../x`,
      `/${TOKEN}/docs/%2e%2e/%2e%2e/x`,
      `/${TOKEN}/docs//plan.md`,
      `/${TOKEN}/docs%5c..%5cx`,
      '/not-a-token/docs/plan.md',
      '/_share/assets/../x'
    ]) {
      expect(parseArtifactShareRequest(url).kind).toMatch(/not-found|bad-request/)
    }
    expect(parseArtifactShareRequest(`/${TOKEN}/%E0%A4%A`).kind).toBe('bad-request')
  })
})

describe('resolveArtifactShareRequestFile', () => {
  it('reads files and directory index pages inside the root', async () => {
    await expect(resolveArtifactShareRequestFile(root, ['docs', 'plan.md'])).resolves.toMatchObject(
      {
        relativePath: 'docs/plan.md'
      }
    )
    await expect(resolveArtifactShareRequestFile(root, ['site'])).resolves.toMatchObject({
      relativePath: 'site/index.html'
    })
  })

  it('refuses credentials, symlinks that leave the root, and directories without an index', async () => {
    await expect(resolveArtifactShareRequestFile(root, ['.git', 'config'])).resolves.toBeNull()
    await expect(resolveArtifactShareRequestFile(root, ['.env'])).resolves.toBeNull()
    await expect(resolveArtifactShareRequestFile(root, ['docs', 'escape.txt'])).resolves.toBeNull()
    await expect(
      resolveArtifactShareRequestFile(root, ['docs', 'env-alias.txt'])
    ).resolves.toBeNull()
    await expect(resolveArtifactShareRequestFile(root, ['docs'])).resolves.toBeNull()
    await expect(resolveArtifactShareRequestFile(root, ['docs', 'missing.md'])).resolves.toBeNull()
  })
})

describe('resolveArtifactShareOwnerTarget', () => {
  it('returns the canonical root, label and relative path', async () => {
    const target = await resolveArtifactShareOwnerTarget({
      workspaceRoot: root,
      sourcePath: join(root, 'docs', 'plan.md')
    })
    expect(target.relativePath).toBe('docs/plan.md')
    expect(target.label).toBe('workspace')
  })

  it('refuses credential files, escaping symlinks and directories', async () => {
    for (const sourcePath of [
      join(root, '.env'),
      join(root, 'docs', 'escape.txt'),
      join(root, 'docs'),
      join(sandbox, 'outside.txt')
    ]) {
      await expect(
        resolveArtifactShareOwnerTarget({ workspaceRoot: root, sourcePath })
      ).rejects.toMatchObject({ code: 'artifact_share_path_denied' })
    }
  })
})
