import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  GoalEditorDraftRecordSchema,
  GoalEditorDraftContentSchema,
  type GoalEditorDraftRecord,
  type GoalEditorDraftDelete,
  type GoalEditorDraftDeleteResult,
  type GoalEditorDraftSave,
  type GoalEditorDraftSummary
} from '../../shared/goals/goal-editor-draft-contract'
import type { GoalAcceptanceDrafts } from './goal-acceptance-drafts'
import { readJson, writeJsonAtomic, writeTextAtomic } from './goal-record-files'

/** Only the execution host writes draft records; optimistic revisions reject stale editors. */
export class GoalEditorDraftStore {
  private readonly writes = new Map<string, Promise<unknown>>()
  constructor(
    private readonly goalHome: string,
    private readonly attempts: Pick<GoalAcceptanceDrafts, 'get' | 'cancel'>
  ) {}

  async get(id: string): Promise<GoalEditorDraftRecord | null> {
    if (await this.isDeleted(id)) {
      return null
    }
    const raw = await readJson(join(this.directory(), `${id}.json`))
    return raw === null ? null : this.withDocumentFile(GoalEditorDraftRecordSchema.parse(raw))
  }

  save(input: GoalEditorDraftSave): Promise<GoalEditorDraftRecord> {
    return this.serialize(input.editorDraftId, async () => {
      if (await this.isDeleted(input.editorDraftId)) {
        throw new Error('This goal draft was deleted. Create a new draft to continue.')
      }
      const previous = await this.get(input.editorDraftId)
      // Why before the revision check: this also answers a retried lost response without
      // overwriting a newer draft. Why at all: the editor saves on every change, and a revision
      // per save would rewrite the whole document each time and leave the old copy behind.
      if (previous && matchesStoredContent(previous, input.content)) {
        return previous
      }
      if ((previous?.revision ?? 0) !== input.expectedRevision) {
        throw new Error(
          'This draft was changed in another editor. Your unsaved text is kept here; reopen the saved draft before retrying.'
        )
      }
      const next = await this.withDocumentFile(
        GoalEditorDraftRecordSchema.parse({
          ...input.content,
          editorDraftId: input.editorDraftId,
          revision: (previous?.revision ?? 0) + 1,
          createdAt: previous?.createdAt ?? Date.now(),
          updatedAt: Date.now()
        })
      )
      await writeJsonAtomic(join(this.directory(), `${input.editorDraftId}.json`), next)
      return next
    })
  }

  delete(input: GoalEditorDraftDelete): Promise<GoalEditorDraftDeleteResult> {
    return this.serialize(input.editorDraftId, async () => {
      const record = await this.get(input.editorDraftId)
      if (record && record.revision !== input.expectedRevision) {
        throw new Error('This draft changed in another editor. Reopen it before deleting.')
      }
      if (record?.generation) {
        const result = await this.attempts.cancel(record.generation.draftId)
        if (result?.status === 'generating') {
          return { status: result.phase === 'unverifiable' ? 'unverifiable' : 'stopping' }
        }
      }
      // Keep a tombstone so delayed saves cannot recreate the draft; document paths remain valid.
      await writeJsonAtomic(this.tombstone(input.editorDraftId), { deletedAt: Date.now() })
      return { status: 'deleted' }
    })
  }

  private serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.get(id) ?? Promise.resolve()
    const write = pending.catch(() => {}).then(operation)
    this.writes.set(id, write)
    void write
      .finally(() => {
        if (this.writes.get(id) === write) {
          this.writes.delete(id)
        }
      })
      .catch(() => {})
    return write
  }

  private tombstone(id: string): string {
    return join(this.directory(), `${id}.deleted.json`)
  }

  private async isDeleted(id: string): Promise<boolean> {
    return (await readJson(this.tombstone(id))) !== null
  }

  async list(): Promise<{ items: GoalEditorDraftSummary[] }> {
    const names = await readdir(this.directory()).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    })
    const records: GoalEditorDraftRecord[] = []
    for (const name of names.filter((name) => /^[\da-f-]{36}\.json$/i.test(name))) {
      const record = await this.get(name.slice(0, -5))
      if (record && !record.archived) {
        records.push(record)
      }
    }
    records.sort((a, b) => b.updatedAt - a.updatedAt)
    const items: GoalEditorDraftSummary[] = []
    for (const record of records) {
      const result = record.generation ? await this.attempts.get(record.generation.draftId) : null
      const { document: _document, ...generation } = result ?? { document: null }
      items.push({
        editorDraftId: record.editorDraftId,
        objectivePreview: record.fields.objective.replace(/\s+/g, ' ').slice(0, 160),
        worktreeId: record.target.worktreeId,
        goalId: record.goalId,
        updatedAt: record.updatedAt,
        hasDocument: Boolean(record.fields.acceptanceDocument),
        generation: result
          ? (generation as NonNullable<GoalEditorDraftSummary['generation']>)
          : null
      })
    }
    return { items }
  }

  private directory(): string {
    return join(this.goalHome, 'v2', 'editor-drafts')
  }

  private async withDocumentFile(record: GoalEditorDraftRecord): Promise<GoalEditorDraftRecord> {
    const document = record.fields.acceptanceDocument
    if (!document) {
      return { ...record, documentPath: undefined }
    }
    // Why not keyed by revision: that minted a new 30 KB file per save and left every older one
    // behind, and the path a reader had copied stopped being the current document.
    const documentPath = join(this.directory(), record.editorDraftId, 'acceptance.md')
    const saved = await readFile(documentPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if (saved !== document) {
      await writeTextAtomic(documentPath, document)
    }
    return { ...record, documentPath }
  }
}

/** Content equality ignoring the fields the store owns. */
function matchesStoredContent(
  stored: GoalEditorDraftRecord,
  content: GoalEditorDraftSave['content']
): boolean {
  const {
    editorDraftId: _id,
    revision: _revision,
    createdAt: _created,
    updatedAt: _updated,
    documentPath: _documentPath,
    ...storedContent
  } = stored
  return (
    JSON.stringify(storedContent) === JSON.stringify(GoalEditorDraftContentSchema.parse(content))
  )
}
