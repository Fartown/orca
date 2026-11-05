import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffComment } from '../../shared/diff-comment-types'
import { mergeDiffCommentMutation } from '../../shared/diff-comment-mutation'
import {
  importArtifactShareComments,
  type ArtifactShareCommentImportRuntime
} from './artifact-share-comment-import'
import {
  addArtifactShareComment,
  deleteOwnArtifactShareComment,
  editArtifactShareComment
} from './store/artifact-share-comments'

let root: string
let home: string
let ledgerPath: string
const workspace = '/work/orca-docs'

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'artifact-share-comment-import-'))
  home = join(root, 'share-home')
  ledgerPath = join(home, 'comment-imports', 'profile.json')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** One workspace whose owner merges note writes against their base, like the real store. */
function workspaceOwner(input: { hostId?: string; present?: boolean } = {}) {
  const notes: DiffComment[] = []
  const state = { notes, present: input.present ?? true }
  const worktree = () => ({
    id: 'repo::/work/orca-docs',
    path: workspace,
    hostId: input.hostId,
    diffComments: state.notes
  })
  const runtime: ArtifactShareCommentImportRuntime = {
    resolveWorktreeForContainedPath: async (path) =>
      state.present && path.startsWith(`${workspace}/`) ? worktree() : null,
    showManagedWorktree: async () => worktree(),
    updateManagedWorktreeMeta: async (_selector, updates) => {
      state.notes = mergeDiffCommentMutation(
        updates.diffCommentsBase,
        state.notes,
        updates.diffComments
      )
    }
  }
  return { state, runtime }
}

function comment(body: string, startLine = 3, endLine = 3) {
  return addArtifactShareComment(
    home,
    { rootPath: workspace, relativePath: 'docs/plan.md' },
    { author: '张三', body, startLine, endLine, quote: 'Plan step' },
    new Date('2026-11-05T08:00:00Z')
  )
}

describe('reader comments becoming review notes', () => {
  it('adds each comment once, at its lines in the file, and never revives a note the user cleared', async () => {
    const owner = workspaceOwner()
    await comment('这里写错了', 2, 4)
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(1)
    expect(owner.state.notes).toEqual([
      expect.objectContaining({
        worktreeId: 'repo::/work/orca-docs',
        filePath: 'docs/plan.md',
        source: 'markdown',
        startLine: 2,
        lineNumber: 4,
        selectedText: 'Plan step',
        body: '张三 via share link: 这里写错了',
        createdAt: Date.parse('2026-11-05T08:00:00Z'),
        side: 'modified'
      })
    ])

    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(0)
    // Sending notes to an agent deletes them; the comment must not come back as a note.
    owner.state.notes = []
    await comment('还有一处', 5, 5)
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(1)
    expect(owner.state.notes.map((note) => [note.body, note.startLine, note.lineNumber])).toEqual([
      ['张三 via share link: 还有一处', undefined, 5]
    ])
  })

  it('leaves comments waiting while no workspace on this computer holds the file', async () => {
    const remote = workspaceOwner({ hostId: 'ssh:minizc' })
    await comment('等工作区打开')
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: remote.runtime })
    ).resolves.toBe(0)
    expect(remote.state.notes).toEqual([])

    const closed = workspaceOwner({ present: false })
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: closed.runtime })
    ).resolves.toBe(0)

    const opened = workspaceOwner()
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: opened.runtime })
    ).resolves.toBe(1)
    expect(opened.state.notes.map((note) => note.body)).toEqual([
      '张三 via share link: 等工作区打开'
    ])
  })

  it("follows the author's edit and delete only to notes nobody changed in Orca", async () => {
    const owner = workspaceOwner()
    const target = { rootPath: workspace, relativePath: 'docs/plan.md' }
    const kept = await comment('第一处')
    const changedInOrca = await comment('第二处')
    await importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    const noteBody = (id: string) =>
      owner.state.notes.find((note) => note.id === `share-comment-${id}`)?.body
    owner.state.notes = owner.state.notes.map((note) =>
      note.id === `share-comment-${changedInOrca.comment.id}`
        ? { ...note, body: '我在 Orca 里改过' }
        : note
    )

    const later = new Date('2026-11-05T09:00:00Z')
    for (const created of [kept, changedInOrca]) {
      await editArtifactShareComment(home, target, {
        id: created.comment.id,
        editToken: created.editToken,
        body: '作者改了',
        now: later
      })
    }
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(1)
    expect(noteBody(kept.comment.id)).toBe('张三 via share link: 作者改了')
    expect(noteBody(changedInOrca.comment.id)).toBe('我在 Orca 里改过')

    for (const created of [kept, changedInOrca]) {
      await deleteOwnArtifactShareComment(home, target, {
        id: created.comment.id,
        editToken: created.editToken
      })
    }
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(1)
    expect(owner.state.notes.map((note) => note.body)).toEqual(['我在 Orca 里改过'])
    await expect(
      importArtifactShareComments({ home, ledgerPath, runtime: owner.runtime })
    ).resolves.toBe(0)
  })
})
