import { useState } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

export function GoalAcceptanceDocument(props: {
  value: string
  onChange: (value: string) => void
  generating: boolean
  canGenerate: boolean
  stale: boolean
  onReview: () => void
  onGenerate: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [preview, setPreview] = useState(false)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="goal-acceptance-document">
          {translate('goals.editor.document', 'Acceptance document')}
        </Label>
        {props.generating ? (
          <Button type="button" size="xs" variant="outline" onClick={props.onCancel}>
            {translate('goals.editor.cancelGeneration', 'Cancel generation')}
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
              'Review and edit the scope, acceptance criteria and required evidence below. You can also paste an existing document. Starting saves this document for both execution and verification.'
            )}
      </p>
      {props.value ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setPreview(!preview)}>
          {preview
            ? translate('goals.editor.editDocument', 'Edit document')
            : translate('goals.editor.previewDocument', 'Preview document')}
        </Button>
      ) : null}
      {preview && props.value ? (
        <CommentMarkdown content={props.value} variant="document" />
      ) : (
        <Textarea
          id="goal-acceptance-document"
          rows={12}
          value={props.value}
          disabled={props.generating}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.stale ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {translate(
              'goals.editor.documentStale',
              'The goal, guard or session changed. Review the document against the new context, or regenerate it.'
            )}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={props.generating}
            onClick={props.onReview}
          >
            {translate('goals.editor.documentReviewed', 'I reviewed the updated context')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
