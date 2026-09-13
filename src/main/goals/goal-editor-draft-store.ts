import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  GoalEditorDraftRecordSchema,
  GoalEditorDraftContentSchema,
  type GoalEditorDraftRecord,
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
    private readonly attempts: GoalAcceptanceDrafts
  ) {}

  async get(id: string): Promise<GoalEditorDraftRecord | null> {
    const raw = await readJson(join(this.directory(), `${id}.json`))
    return raw === null ? null : this.withDocumentFile(GoalEditorDraftRecordSchema.parse(raw))
  }

  save(input: GoalEditorDraftSave): Promise<GoalEditorDraftRecord> {
    const pending = this.writes.get(input.editorDraftId) ?? Promise.resolve()
    const write = pending
      .catch(() => {})
      .then(async () => {
        const previous = await this.get(input.editorDraftId)
        if ((previous?.revision ?? 0) !== input.expectedRevision) {
          // A lost response may be retried without overwriting a newer draft.
          const {
            editorDraftId: _id,
            revision: _rev,
            createdAt: _created,
            updatedAt: _updated,
            documentPath: _documentPath,
            ...content
          } = previous ?? ({} as GoalEditorDraftRecord)
          if (
            previous &&
            JSON.stringify(content) ===
              JSON.stringify(GoalEditorDraftContentSchema.parse(input.content))
          ) {
            return previous
          }
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
    this.writes.set(input.editorDraftId, write)
    void write
      .finally(() => {
        if (this.writes.get(input.editorDraftId) === write) {
          this.writes.delete(input.editorDraftId)
        }
      })
      .catch(() => {})
    return write
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
    const documentPath = join(
      this.directory(),
      record.editorDraftId,
      `acceptance-${record.revision}.md`
    )
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
