import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArtifactShareError } from '../../../shared/self-hosted-artifacts/artifact-share-errors'
import {
  readArtifactShareWorkspaces,
  shareArtifactWorkspaceFile,
  stopArtifactShareWorkspace
} from './artifact-share-records'
import { readArtifactShareConfig, updateArtifactShareConfig } from './artifact-share-config'
import { artifactShareRecordsPath } from './artifact-share-store-layout'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orca-artifact-share-records-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

const now = new Date('2026-09-16T12:00:00.000Z')

describe('artifact share records', () => {
  it('starts empty and mints one token per workspace root', async () => {
    expect(readArtifactShareWorkspaces(home)).toEqual([])
    const first = await shareArtifactWorkspaceFile(home, {
      rootPath: '/work/octo',
      label: 'octo',
      relativePath: 'docs/a.md',
      now
    })
    const second = await shareArtifactWorkspaceFile(home, {
      rootPath: '/work/octo',
      label: 'octo',
      relativePath: 'docs/b.md',
      now
    })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.workspace.token).toBe(first.workspace.token)
    expect(first.workspace.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(
      readArtifactShareWorkspaces(home)[0]?.linkedFiles.map((file) => file.relativePath)
    ).toEqual(['docs/b.md', 'docs/a.md'])
  })

  it('keeps concurrent writers from losing each other’s workspaces', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        shareArtifactWorkspaceFile(home, {
          rootPath: `/work/w${index}`,
          label: `w${index}`,
          relativePath: 'a.md',
          now
        })
      )
    )
    expect(readArtifactShareWorkspaces(home)).toHaveLength(8)
  })

  it('revokes the token when a workspace stops sharing and mints a new one on re-share', async () => {
    const first = await shareArtifactWorkspaceFile(home, {
      rootPath: '/work/octo',
      label: 'octo',
      relativePath: 'a.md',
      now
    })
    await expect(stopArtifactShareWorkspace(home, first.workspace.token)).resolves.toBe(true)
    await expect(stopArtifactShareWorkspace(home, first.workspace.token)).resolves.toBe(false)
    const again = await shareArtifactWorkspaceFile(home, {
      rootPath: '/work/octo',
      label: 'octo',
      relativePath: 'a.md',
      now
    })
    expect(again.created).toBe(true)
    expect(again.workspace.token).not.toBe(first.workspace.token)
  })

  it('refuses to read a records file written by a newer Orca', async () => {
    await writeFile(artifactShareRecordsPath(home), JSON.stringify({ version: 2, workspaces: [] }))
    expect(() => readArtifactShareWorkspaces(home)).toThrow(ArtifactShareError)
    await expect(
      shareArtifactWorkspaceFile(home, { rootPath: '/w', label: 'w', relativePath: 'a.md', now })
    ).rejects.toThrow(ArtifactShareError)
    expect(JSON.parse(await readFile(artifactShareRecordsPath(home), 'utf8')).version).toBe(2)
  })
})

describe('artifact share config', () => {
  it('defaults to the preferred port with no confirmed port and persists patches', async () => {
    expect(readArtifactShareConfig(home)).toMatchObject({
      preferredPort: 18787,
      confirmedPort: null,
      ip: 'auto'
    })
    await updateArtifactShareConfig(home, { confirmedPort: 18787 })
    await updateArtifactShareConfig(home, { ip: '10.0.0.5' })
    expect(readArtifactShareConfig(home)).toMatchObject({ confirmedPort: 18787, ip: '10.0.0.5' })
  })
})
