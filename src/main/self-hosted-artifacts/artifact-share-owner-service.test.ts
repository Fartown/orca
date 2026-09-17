import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ArtifactShareServiceStatus } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import { createArtifactShareOwnerService } from './artifact-share-owner-service'
import { readArtifactShareWorkspaces } from './store/artifact-share-records'

const SERVING: ArtifactShareServiceStatus = {
  state: 'serving',
  port: 18787,
  ip: '192.168.1.20',
  ipCandidates: ['192.168.1.20']
}

let base: string
let home: string
let workspace: string
let status: ArtifactShareServiceStatus

function owner() {
  return createArtifactShareOwnerService({
    home,
    host: { executionHostId: 'local', label: 'minizc' },
    readStatus: async () => status,
    now: () => new Date('2026-09-16T12:00:00.000Z')
  })
}

async function writeWorkspaceFile(relativePath: string, content = '# doc\n'): Promise<string> {
  const path = join(workspace, relativePath)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
  return path
}

async function expectShareError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  )
  expect(error).toBeInstanceOf(ArtifactShareError)
  expect(error instanceof ArtifactShareError ? error.code : null).toBe(code)
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'orca-artifact-share-owner-')))
  home = join(base, 'share-home')
  workspace = join(base, 'octo')
  await mkdir(workspace, { recursive: true })
  status = SERVING
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('artifact share owner service', () => {
  it('names the workspace a share would open before anything is shared', async () => {
    const sourcePath = await writeWorkspaceFile('docs/plan.md')

    const result = await owner().lookup({ workspaceRoot: workspace, sourcePath })

    expect(result.file).toEqual({
      workspace: null,
      rootPath: workspace,
      workspaceLabel: 'octo',
      relativePath: 'docs/plan.md',
      url: null
    })
    expect(readArtifactShareWorkspaces(home)).toEqual([])
  })

  it('mints one token per workspace and links each file under it', async () => {
    const first = await writeWorkspaceFile('docs/plan.md')
    const second = await writeWorkspaceFile('notes/草稿 1.md')

    const a = await owner().share({ workspaceRoot: workspace, sourcePath: first })
    const b = await owner().share({ workspaceRoot: workspace, sourcePath: second })

    expect(a.workspaceCreated).toBe(true)
    expect(b.workspaceCreated).toBe(false)
    const token = a.file.workspace?.token
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(b.file.workspace?.token).toBe(token)
    expect(a.file.url).toBe(`http://192.168.1.20:18787/${token}/docs/plan.md`)
    expect(b.file.url).toBe(
      `http://192.168.1.20:18787/${token}/notes/${encodeURIComponent('草稿 1.md')}`
    )
    const lookup = await owner().lookup({ workspaceRoot: workspace, sourcePath: first })
    expect(lookup.file.url).toBe(a.file.url)
  })

  it('refuses to share unless this computer is serving, and records nothing', async () => {
    const sourcePath = await writeWorkspaceFile('a.md')
    const cases: [ArtifactShareServiceStatus, string][] = [
      [{ state: 'sharing-off' }, ARTIFACT_SHARE_ERROR_CODES.sharingDisabled],
      [{ state: 'orca-not-running' }, ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning],
      [{ state: 'port-conflict', port: 18787 }, ARTIFACT_SHARE_ERROR_CODES.portConflict],
      [{ state: 'failed', reason: 'EACCES', logPath: null }, ARTIFACT_SHARE_ERROR_CODES.serveFailed]
    ]
    for (const [state, code] of cases) {
      status = state
      await expectShareError(owner().share({ workspaceRoot: workspace, sourcePath }), code)
    }
    expect(readArtifactShareWorkspaces(home)).toEqual([])
  })

  it('keeps links listed but without URLs while the service is down', async () => {
    const sourcePath = await writeWorkspaceFile('a.md')
    await owner().share({ workspaceRoot: workspace, sourcePath })
    status = { state: 'sharing-off' }

    const listing = await owner().list()

    expect(listing.service).toEqual({ state: 'sharing-off' })
    expect(listing.workspaces).toHaveLength(1)
    expect(listing.workspaces[0]?.urlBase).toBeNull()
    expect(listing.workspaces[0]?.linkedFiles.map((file) => file.url)).toEqual([null])
  })

  it('scopes a file outside any workspace to its own folder', async () => {
    const sourcePath = await writeWorkspaceFile('deep/inner/report.md')

    const result = await owner().share({ sourcePath })

    expect(result.file.rootPath).toBe(join(workspace, 'deep', 'inner'))
    expect(result.file.relativePath).toBe('report.md')
  })

  it('reuses the deepest shared folder that already holds the file', async () => {
    const outer = await writeWorkspaceFile('a.md')
    const nested = await writeWorkspaceFile('docs/sub/b.md')
    const shared = await owner().share({ workspaceRoot: workspace, sourcePath: outer })

    const lookup = await owner().lookup({ sourcePath: nested })
    const share = await owner().share({ sourcePath: nested })

    expect(lookup.file.workspace?.token).toBe(shared.file.workspace?.token)
    expect(share.workspaceCreated).toBe(false)
    expect(share.file.relativePath).toBe('docs/sub/b.md')
  })

  it('denies files that escape the workspace, credentials, and folders', async () => {
    const outside = join(base, 'secret.md')
    await writeFile(outside, 'secret')
    await symlink(outside, join(workspace, 'link.md'))
    await writeWorkspaceFile('.env', 'TOKEN=1')
    await writeWorkspaceFile('config/.ssh/id_ed25519', 'key')
    await mkdir(join(workspace, 'folder'))

    for (const sourcePath of [
      join(workspace, 'link.md'),
      join(workspace, '.env'),
      join(workspace, 'config', '.ssh', 'id_ed25519'),
      join(workspace, 'folder'),
      join(workspace, 'missing.md')
    ]) {
      await expectShareError(
        owner().share({ workspaceRoot: workspace, sourcePath }),
        ARTIFACT_SHARE_ERROR_CODES.pathDenied
      )
    }
  })

  it('revokes the token when sharing stops, so a new share mints a new one', async () => {
    const sourcePath = await writeWorkspaceFile('a.md')
    const first = await owner().share({ workspaceRoot: workspace, sourcePath })
    const token = first.file.workspace?.token ?? ''

    await expect(owner().stopWorkspace(token)).resolves.toEqual({ stopped: true })
    await expect(owner().stopWorkspace(token)).resolves.toEqual({ stopped: false })
    const lookup = await owner().lookup({ workspaceRoot: workspace, sourcePath })
    const again = await owner().share({ workspaceRoot: workspace, sourcePath })

    expect(lookup.file.workspace).toBeNull()
    expect(again.workspaceCreated).toBe(true)
    expect(again.file.workspace?.token).not.toBe(token)
  })
})
