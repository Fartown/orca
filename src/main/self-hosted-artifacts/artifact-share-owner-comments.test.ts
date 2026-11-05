import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffComment } from '../../shared/diff-comment-types'
import { mergeDiffCommentMutation } from '../../shared/diff-comment-mutation'
import {
  importArtifactShareComments,
  removeArtifactShareReviewNotes,
  type ArtifactShareCommentImportRuntime
} from './artifact-share-comment-import'
import { createArtifactShareOwnerService } from './artifact-share-owner-service'
import {
  addArtifactShareComment,
  listArtifactShareCommentFiles
} from './store/artifact-share-comments'

let root: string
let home: string
let workspace: string
let docPath: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'artifact-share-owner-comments-')))
  home = join(root, 'share-home')
  workspace = join(root, 'workspace')
  docPath = join(workspace, 'docs', 'plan.md')
  await mkdir(join(workspace, 'docs'), { recursive: true })
  await writeFile(docPath, '# Plan\n\nStep one.\n\nStep two.\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function ownerWithNotes() {
  const state: { notes: DiffComment[] } = { notes: [] }
  const worktree = () => ({ id: 'repo::ws', path: workspace, diffComments: state.notes })
  const runtime: ArtifactShareCommentImportRuntime = {
    resolveWorktreeForContainedPath: async (path) =>
      path.startsWith(`${workspace}/`) ? worktree() : null,
    showManagedWorktree: async () => worktree(),
    updateManagedWorktreeMeta: async (_selector, updates) => {
      state.notes = mergeDiffCommentMutation(
        updates.diffCommentsBase,
        state.notes,
        updates.diffComments
      )
    }
  }
  const owner = createArtifactShareOwnerService({
    home,
    host: { executionHostId: 'local', label: 'mbp5' },
    readStatus: async () => ({ state: 'sharing-off' }),
    removeReviewNotes: (absolutePath, ids) =>
      removeArtifactShareReviewNotes(runtime, absolutePath, ids)
  })
  return { state, runtime, owner }
}

async function leave(body: string, line: number) {
  return addArtifactShareComment(
    home,
    { rootPath: workspace, relativePath: 'docs/plan.md' },
    { author: '张三', body, startLine: line, endLine: line },
    new Date(`2026-11-05T08:0${line}:00Z`)
  )
}

describe('reading and deleting comments on the computer that holds the file', () => {
  it('lists a file’s comments oldest first and deletes chosen ones with the notes they became', async () => {
    const { state, runtime, owner } = ownerWithNotes()
    const first = await leave('第一条', 3)
    const second = await leave('第二条', 5)
    await importArtifactShareComments({
      home,
      ledgerPath: join(home, 'comment-imports', 'p.json'),
      runtime
    })
    expect(state.notes).toHaveLength(2)

    const listed = await owner.comments({ sourcePath: docPath })
    expect(listed.comments.map((comment) => comment.body)).toEqual(['第一条', '第二条'])

    await expect(
      owner.deleteComments({ sourcePath: docPath, commentIds: [first.id] })
    ).resolves.toEqual({
      host: { executionHostId: 'local', label: 'mbp5' },
      deletedComments: 1,
      removedNotes: 1
    })
    expect((await owner.comments({ sourcePath: docPath })).comments.map((c) => c.id)).toEqual([
      second.id
    ])
    expect(state.notes.map((note) => note.body)).toEqual(['张三 via share link: 第二条'])

    await expect(owner.deleteComments({ sourcePath: docPath, all: true })).resolves.toMatchObject({
      deletedComments: 1,
      removedNotes: 1
    })
    expect(listArtifactShareCommentFiles(home)).toEqual([])
    expect(state.notes).toEqual([])
  })

  it('refuses a request naming both ids and all, and a file that no longer exists', async () => {
    const { owner } = ownerWithNotes()
    const comment = await leave('留着', 3)
    await expect(
      owner.deleteComments({ sourcePath: docPath, commentIds: [comment.id], all: true })
    ).rejects.toThrow('not both')
    await expect(owner.comments({ sourcePath: join(workspace, 'gone.md') })).rejects.toMatchObject({
      code: 'artifact_share_path_denied'
    })
    expect((await owner.comments({ sourcePath: docPath })).comments).toHaveLength(1)
  })
})
