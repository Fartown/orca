import React, { useCallback, useState } from 'react'
import { CornerDownLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImeTextarea } from '@/lib/ime-text-field'
import { formatMarkdownReviewCardQuote } from '@/lib/markdown-review-notes'
import { getIntlLocale, translate } from '@/i18n/i18n'
import {
  getMarkdownPreviewAnnotationQuote,
  getMarkdownPreviewBlockRange,
  hasMarkdownPreviewNestedBlock
} from '@/components/editor/markdown-preview-block-model'
import type { MarkdownPreviewPositionNode } from '@/components/editor/markdown-preview-types'
import type { ArtifactShareComment } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import type { ShareCommentPostError } from './share-viewer-comments-client'
import {
  shareCommentBlockKey,
  useShareComments,
  type ShareCommentRange
} from './share-viewer-comments-state'

function formatCommentTime(createdAt: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(createdAt))
}

function postErrorMessage(error: ShareCommentPostError): string {
  switch (error) {
    case 'rate-limited':
      return translate(
        'auto.components.selfHostedArtifacts.shareViewer.commentRateLimited',
        'Too many comments in a short time. Try again in a minute.'
      )
    case 'too-many-comments':
      return translate(
        'auto.components.selfHostedArtifacts.shareViewer.commentLimit',
        'This file has reached its comment limit.'
      )
    case 'failed':
      return translate(
        'auto.components.selfHostedArtifacts.shareViewer.commentFailed',
        "Couldn't save the comment. Check that the link still opens, then try again."
      )
  }
}

/** Same card markup and classes as the app's review notes, read-only for readers. */
export function ShareCommentCard({
  comment
}: {
  comment: ArtifactShareComment
}): React.JSX.Element {
  const quote = formatMarkdownReviewCardQuote(comment.quote)
  return (
    <div className="markdown-annotation-card">
      <div className="orca-diff-comment-card">
        <div className="orca-diff-comment-content-col">
          <div className="orca-diff-comment-header">
            <div className="orca-diff-comment-meta-group">
              {comment.author} {formatCommentTime(comment.createdAt)}
            </div>
          </div>
          {quote ? (
            <div className="orca-diff-comment-quote">
              <div className="orca-diff-comment-quote-text">{quote}</div>
            </div>
          ) : null}
          <div className="orca-diff-comment-body">{comment.body}</div>
        </div>
      </div>
    </div>
  )
}

function ShareCommentComposer({
  range,
  quote
}: {
  range: ShareCommentRange
  quote?: string
}): React.JSX.Element {
  const { author: savedAuthor, submit, setActiveBlockKey } = useShareComments()
  const [author, setAuthor] = useState(savedAuthor)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ShareCommentPostError | null>(null)
  const focusBodyRef = useCallback((textarea: HTMLTextAreaElement | null) => textarea?.focus(), [])
  const canSubmit = !submitting && author.trim().length > 0 && body.trim().length > 0
  const cancel = (): void => setActiveBlockKey(null)

  const send = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    setError(null)
    const failure = await submit({ range, quote, author: author.trim(), body: body.trim() })
    setSubmitting(false)
    setError(failure)
  }

  return (
    <div className="markdown-annotation-composer" onClick={(event) => event.stopPropagation()}>
      <Input
        className="mb-2"
        value={author}
        maxLength={64}
        placeholder={translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentAuthor',
          'Your name'
        )}
        aria-label={translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentAuthor',
          'Your name'
        )}
        onChange={(event) => setAuthor(event.target.value)}
      />
      <ImeTextarea
        ref={savedAuthor ? focusBodyRef : undefined}
        className="orca-diff-comment-popover-textarea"
        placeholder={translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentPlaceholder',
          'Add a comment'
        )}
        value={body}
        maxLength={4_000}
        rows={3}
        onChange={(event) => {
          setBody(event.target.value)
          const textarea = event.currentTarget
          textarea.style.height = 'auto'
          textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
            return
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
            event.preventDefault()
            void send()
          }
        }}
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {postErrorMessage(error)}
        </p>
      ) : null}
      <div className="orca-diff-comment-popover-footer">
        <Button variant="ghost" size="sm" onClick={cancel} disabled={submitting}>
          {translate('auto.components.selfHostedArtifacts.shareViewer.commentCancel', 'Cancel')}
        </Button>
        <Button size="sm" onClick={() => void send()} disabled={!canSubmit}>
          {submitting
            ? translate('auto.components.selfHostedArtifacts.shareViewer.commentSaving', 'Saving…')
            : translate('auto.components.selfHostedArtifacts.shareViewer.commentSubmit', 'Comment')}
          {!submitting && <CornerDownLeft className="ml-1 size-3 opacity-70" />}
        </Button>
      </div>
    </div>
  )
}

function ShareCommentControls({
  range,
  quote,
  comments
}: {
  range: ShareCommentRange
  quote?: string
  comments: ArtifactShareComment[]
}): React.JSX.Element {
  const { activeBlockKey, setActiveBlockKey } = useShareComments()
  const blockKey = shareCommentBlockKey(range)
  const addLabel = translate(
    'auto.components.selfHostedArtifacts.shareViewer.addComment',
    'Add comment'
  )
  return (
    <div className="markdown-annotation-controls">
      <button
        type="button"
        className="markdown-annotation-add"
        aria-label={addLabel}
        title={addLabel}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setActiveBlockKey(activeBlockKey === blockKey ? null : blockKey)
        }}
      >
        <Plus className="size-3" />
      </button>
      {activeBlockKey === blockKey ? <ShareCommentComposer range={range} quote={quote} /> : null}
      <div className="markdown-annotation-note-stack">
        {comments.map((comment) => (
          <ShareCommentCard key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  )
}

function useBlockComments(node: MarkdownPreviewPositionNode | undefined): {
  range: ShareCommentRange
  comments: ArtifactShareComment[]
} | null {
  const { available, comments } = useShareComments()
  const range = getMarkdownPreviewBlockRange(node)
  if (!available || !range) {
    return null
  }
  return {
    range,
    comments: comments.filter(
      (comment) => comment.startLine === range.startLine && comment.endLine === range.endLine
    )
  }
}

/** Paragraphs, headings, code and tables: the block itself gains a comment rail beside it. */
export function ShareCommentBlock({
  node,
  children
}: {
  node?: MarkdownPreviewPositionNode
  children: React.ReactNode
}): React.JSX.Element {
  const block = useBlockComments(node)
  if (!block) {
    return <>{children}</>
  }
  return (
    <div
      // Why tabIndex: on touch screens focusing the block is what reveals its add button.
      tabIndex={-1}
      className={`markdown-annotation-block ${block.comments.length > 0 ? 'has-review-notes' : ''}`.trim()}
      data-share-comment-block={shareCommentBlockKey(block.range)}
    >
      {children}
      <ShareCommentControls
        range={block.range}
        quote={getMarkdownPreviewAnnotationQuote(children)}
        comments={block.comments}
      />
    </div>
  )
}

/** List items keep their `<li>` and put the rail inside it, as the app's preview does. */
export function ShareCommentListItem({
  node,
  children,
  ...props
}: React.ComponentProps<'li'> & {
  node?: MarkdownPreviewPositionNode
}): React.JSX.Element {
  // Why: a loose item's paragraphs carry their own rails, so the item itself takes none.
  const block = useBlockComments(hasMarkdownPreviewNestedBlock(node) ? undefined : node)
  if (!block) {
    return <li {...props}>{children}</li>
  }
  return (
    <li {...props}>
      <div
        tabIndex={-1}
        className={`markdown-annotation-list-block ${block.comments.length > 0 ? 'has-review-notes' : ''}`.trim()}
        data-share-comment-block={shareCommentBlockKey(block.range)}
      >
        <span className="markdown-annotation-list-content">{children}</span>
        <ShareCommentControls
          range={block.range}
          quote={getMarkdownPreviewAnnotationQuote(children)}
          comments={block.comments}
        />
      </div>
    </li>
  )
}
