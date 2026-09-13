import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

export function GoalAcceptanceDocument(props: {
  value: string
  documentPath?: string
  candidatePath?: string
  onOpenDocument: (path: string) => void
  onChange: (value: string) => void
  generating: boolean
  canGenerate: boolean
  stopping?: boolean
  candidate?: string | null
  onAdopt?: () => void
  stale: boolean
  onReview: () => void
  onGenerate: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="goal-acceptance-document">
          {translate('goals.editor.document', 'Acceptance document')}
        </Label>
        {props.generating ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={props.onCancel}
            disabled={props.stopping}
          >
            {translate('goals.editor.stopGeneration', 'Stop generation')}
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!props.canGenerate}
            onClick={props.onGenerate}
          >
            {props.value
              ? translate('goals.editor.regenerate', 'Regenerate document')
              : translate('goals.editor.generate', 'Generate acceptance document')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {props.generating
          ? translate(
              'goals.editor.generating',
              'The guard is reading the workspace and drafting the document. Execution has not started.'
            )
          : translate(
              'goals.editor.documentHint',
              'Open the saved file in a Markdown tab to review it. Edit the document here or paste an existing one; execution and verification use the adopted text.'
            )}
      </p>
      {props.value && props.documentPath ? (
        <DocumentFile path={props.documentPath} onOpen={props.onOpenDocument} />
      ) : null}
      {props.documentPath && props.value ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setEditing(!editing)}>
          {editing
            ? translate('goals.editor.finishEditingDocument', 'Finish editing')
            : translate('goals.editor.editDocument', 'Edit document')}
        </Button>
      ) : null}
      {editing || !props.documentPath || !props.value ? (
        <Textarea
          id="goal-acceptance-document"
          rows={12}
          value={props.value}
          onChange={(event) => {
            setEditing(true)
            props.onChange(event.target.value)
          }}
        />
      ) : null}
      {props.candidate ? (
        <div
          className="space-y-2 rounded-md border border-border p-3"
          data-testid="goal-draft-candidate"
        >
          <p className="text-xs text-muted-foreground">
            {translate(
              'goals.drafts.candidate',
              'A new document is ready. Your edits are preserved. Review this version before adopting it.'
            )}
          </p>
          {props.candidatePath ? (
            <DocumentFile path={props.candidatePath} onOpen={props.onOpenDocument} />
          ) : (
            <Textarea
              readOnly
              aria-label={translate('goals.drafts.previewCandidate', 'Review generated version')}
              value={props.candidate}
              rows={6}
            />
          )}
          <Button type="button" size="xs" variant="outline" onClick={props.onAdopt}>
            {translate('goals.drafts.adoptCandidate', 'Adopt generated document')}
          </Button>
        </div>
      ) : null}
      {props.stale ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {translate(
              'goals.editor.documentStale',
              'The goal, guard or workspace changed. Review the document against the new context, or regenerate it.'
            )}
          </p>
          <Button type="button" size="xs" variant="outline" onClick={props.onReview}>
            {translate('goals.editor.documentReviewed', 'I reviewed the updated context')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function DocumentFile(props: { path: string; onOpen: (path: string) => void }): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border border-border p-3">
      <button
        type="button"
        className="min-w-0 flex-1 break-all text-left font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:underline"
        onClick={() => props.onOpen(props.path)}
      >
        {props.path}
      </button>
      <Button type="button" size="xs" variant="outline" onClick={() => props.onOpen(props.path)}>
        {translate('goals.editor.openMarkdownTab', 'Open Markdown tab')}
      </Button>
    </div>
  )
}
