import type {
  GoalEditorDraftContent,
  GoalEditorDraftRecord
} from '../../../shared/goals/goal-editor-draft-contract'
import { goalRuntimeClient } from './goal-runtime-client'

export type DraftSessionSnapshot = {
  content: GoalEditorDraftContent
  saving: boolean
  error: string | null
  documentPath?: string
}

/** A save belongs to its draft, even after its Sheet unmounts or another draft opens. */
export class GoalEditorDraftSession {
  private listeners = new Set<() => void>()
  private version = 0
  private savedVersion = 0
  private revision: number
  private pending: Promise<void> | null = null
  private snapshot: DraftSessionSnapshot
  readonly id: string

  constructor(record: GoalEditorDraftRecord) {
    this.id = record.editorDraftId
    this.revision = record.revision
    const {
      editorDraftId: _id,
      revision: _revision,
      createdAt: _created,
      updatedAt: _updated,
      documentPath,
      ...content
    } = record
    this.snapshot = { content, saving: false, error: null, documentPath }
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = (): DraftSessionSnapshot => this.snapshot

  change(update: (content: GoalEditorDraftContent) => GoalEditorDraftContent): void {
    this.version++
    this.publish({ content: update(this.snapshot.content) })
    void this.flush().catch(() => {})
  }

  flush(): Promise<void> {
    if (this.pending) {
      return this.pending.then(() => this.flush())
    }
    if (this.savedVersion === this.version) {
      return Promise.resolve()
    }
    this.publish({ saving: true, error: null })
    const pending = this.saveLatest()
      .catch((error) => {
        this.publish({ error: error instanceof Error ? error.message : String(error) })
        throw error
      })
      .finally(() => {
        this.pending = null
        this.publish({ saving: false })
      })
    this.pending = pending
    return pending.then(() => this.flush())
  }

  private async saveLatest(): Promise<void> {
    while (this.savedVersion !== this.version) {
      const version = this.version
      const result = await goalRuntimeClient.saveEditorDraft({
        editorDraftId: this.id,
        expectedRevision: this.revision,
        content: this.snapshot.content
      })
      this.revision = result.revision
      this.savedVersion = version
      if (version === this.version) {
        this.publish({ documentPath: result.documentPath })
      }
    }
  }
  private publish(update: Partial<DraftSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }
    for (const listener of this.listeners) {
      listener()
    }
  }
}

const sessions = new Map<string, GoalEditorDraftSession>()
export async function openGoalDraftSession(
  recordOrId: GoalEditorDraftRecord | string
): Promise<GoalEditorDraftSession> {
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId.editorDraftId
  const cached = sessions.get(id)
  if (cached) {
    return cached
  }
  const record =
    typeof recordOrId === 'string' ? await goalRuntimeClient.getEditorDraft(id) : recordOrId
  if (!record) {
    throw new Error('The saved goal draft could not be found.')
  }
  const session = new GoalEditorDraftSession(record)
  sessions.set(id, session)
  if (record.revision === 0) {
    session.change((content) => content)
  }
  return session
}
