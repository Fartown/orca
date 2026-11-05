import React, { useCallback, useContext, useState } from 'react'
import { CornerDownLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DiffCommentCard } from '@/components/diff-comments/DiffCommentCard'
import { ImeTextarea } from '@/lib/ime-text-field'
import { formatMarkdownReviewCardQuote } from '@/lib/markdown-review-notes'
import { getIntlLocale, translate } from '@/i18n/i18n'
import {
  getMarkdownPreviewBlockRange,
  hasMarkdownPreviewNestedBlock
} from '@/components/editor/markdown-preview-block-model'
import type { MarkdownPreviewPositionNode } from '@/components/editor/markdown-preview-types'
import type { ArtifactShareComment } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import type { ShareCommentPostError } from './share-viewer-comments-client'
import {
  findShareCommentBlocks,
  SHARE_COMMENT_BLOCK_ATTRIBUTE,
  SHARE_COMMENT_CHROME_ATTRIBUTE,
  SHARE_COMMENT_ID_ATTRIBUTE
} from './share-comment-blocks'
import {
  isShareCommentInBlock,
  useShareComments,
  type ShareCommentRange
} from './share-viewer-comments-state'

/** True when the page is too narrow for a side rail; cards then sit under their block. */
export const ShareCommentInlineContext = React.createContext(false)

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

/** The app's review-note card; the browser that wrote a comment can edit and delete it. */
export function ShareCommentCard({
  comment,
  onContentResize
}: {
  comment: ArtifactShareComment
  onContentResize?: () => void
}): React.JSX.Element {
  const { isOwnComment, editComment, deleteComment } = useShareComments()
  const own = isOwnComment(comment.id)
  return (
    <DiffCommentCard
      lineNumber={comment.endLine}
      startLine={comment.startLine === comment.endLine ? undefined : comment.startLine}
      label={null}
      author={
        comment.author ??
        translate(
          'auto.components.selfHostedArtifacts.shareViewer.anonymousReader',
          'Anonymous reader'
        )
      }
      createdAtLabel={formatCommentTime(comment.updatedAt ?? comment.createdAt)}
      quote={formatMarkdownReviewCardQuote(comment.quote)}
      body={comment.body}
      onDelete={own ? () => void deleteComment(comment.id) : undefined}
      onSubmitEdit={own ? (body) => editComment(comment.id, body) : undefined}
      onContentResize={onContentResize}
      observeRenderedSize={onContentResize !== undefined}
    />
  )
}

function isCardControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button,input,textarea,select,a,[contenteditable="true"]') !== null
  )
}

/** Hover on a card emphasizes the text it is about; a click also scrolls that text into view. */
export function ShareCommentCardFrame({
  comment,
  className,
  style,
  frameRef,
  children
}: {
  comment: ArtifactShareComment
  className: string
  style?: React.CSSProperties
  frameRef?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}): React.JSX.Element {
  const { activeCommentId, setActiveCommentId } = useShareComments()
  return (
    <div
      ref={frameRef}
      {...{ [SHARE_COMMENT_ID_ATTRIBUTE]: comment.id, 'data-share-rail-id': comment.id }}
      className={`${className} ${activeCommentId === comment.id ? 'is-active' : ''}`.trim()}
      style={style}
      onMouseEnter={() => setActiveCommentId(comment.id)}
      onMouseLeave={() => setActiveCommentId(null)}
      onClick={(event) => {
        event.stopPropagation()
        setActiveCommentId(comment.id)
        if (!isCardControl(event.target)) {
          findShareCommentBlocks(document, comment)[0]?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
          })
        }
      }}
    >
      {children}
    </div>
  )
}

export function ShareCommentComposer(): React.JSX.Element {
  const { author: savedAuthor, submit, cancelDraft, draft } = useShareComments()
  const [author, setAuthor] = useState(savedAuthor)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ShareCommentPostError | null>(null)
  const focusBodyRef = useCallback((textarea: HTMLTextAreaElement | null) => textarea?.focus(), [])
  const canSubmit = !submitting && body.trim().length > 0
  const quote = formatMarkdownReviewCardQuote(draft?.quote)

  const send = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    setError(null)
    const failure = await submit({ author: author.trim(), body: body.trim() })
    setSubmitting(false)
    setError(failure)
  }

  return (
    <div
      {...{ [SHARE_COMMENT_CHROME_ATTRIBUTE]: '' }}
      className="markdown-annotation-composer"
      onClick={(event) => event.stopPropagation()}
    >
      {quote ? (
        <div className="orca-diff-comment-quote mb-2">
          <div className="orca-diff-comment-quote-text">{quote}</div>
        </div>
      ) : null}
      <ImeTextarea
        ref={focusBodyRef}
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
            cancelDraft()
            return
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
            event.preventDefault()
            void send()
          }
        }}
      />
      <Input
        className="mt-2"
        value={author}
        maxLength={64}
        placeholder={translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentAuthorOptional',
          'Your name (optional)'
        )}
        aria-label={translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentAuthorOptional',
          'Your name (optional)'
        )}
        onChange={(event) => setAuthor(event.target.value)}
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {postErrorMessage(error)}
        </p>
      ) : null}
      <div className="orca-diff-comment-popover-footer">
        <Button variant="ghost" size="sm" onClick={cancelDraft} disabled={submitting}>
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

/** On narrow pages there is no rail, so the composer and cards follow their block. */
function InlineComments({ range }: { range: ShareCommentRange }): React.JSX.Element | null {
  const { comments, draft } = useShareComments()
  const own = comments.filter((comment) => isShareCommentInBlock(comment, range))
  const composing = draft !== null && isShareCommentInBlock(draft.range, range)
  if (own.length === 0 && !composing) {
    return null
  }
  return (
    <div {...{ [SHARE_COMMENT_CHROME_ATTRIBUTE]: '' }} className="orca-share-inline-comments">
      {composing ? <ShareCommentComposer /> : null}
      {own.map((comment) => (
        <ShareCommentCardFrame
          key={comment.id}
          comment={comment}
          className="markdown-annotation-card"
        >
          <ShareCommentCard comment={comment} />
        </ShareCommentCardFrame>
      ))}
    </div>
  )
}

function AddCommentButton({ range }: { range: ShareCommentRange }): React.JSX.Element {
  const { draft, startDraft, cancelDraft } = useShareComments()
  const composing = draft !== null && isShareCommentInBlock(draft.range, range)
  const label = translate(
    'auto.components.selfHostedArtifacts.shareViewer.addComment',
    'Add comment'
  )
  return (
    <button
      type="button"
      {...{ [SHARE_COMMENT_CHROME_ATTRIBUTE]: '' }}
      className="markdown-annotation-add"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (composing) {
          cancelDraft()
        } else {
          startDraft({ range })
        }
      }}
    >
      <Plus className="size-3" />
    </button>
  )
}

function useBlockRange(node: MarkdownPreviewPositionNode | undefined): ShareCommentRange | null {
  const { available } = useShareComments()
  const range = getMarkdownPreviewBlockRange(node)
  return available && range ? range : null
}

function blockAttributes(range: ShareCommentRange): Record<string, string | number> {
  return {
    [SHARE_COMMENT_BLOCK_ATTRIBUTE]: '',
    'data-source-line': range.startLine,
    'data-source-end-line': range.endLine
  }
}

/** Paragraphs, headings, code and tables gain an add button; their cards live in the rail. */
export function ShareCommentBlock({
  node,
  children
}: {
  node?: MarkdownPreviewPositionNode
  children: React.ReactNode
}): React.JSX.Element {
  const range = useBlockRange(node)
  const inline = useContext(ShareCommentInlineContext)
  if (!range) {
    return <>{children}</>
  }
  return (
    // Why tabIndex: on touch screens focusing the block is what reveals its add button.
    <div {...blockAttributes(range)} tabIndex={-1} className="orca-share-comment-block">
      {children}
      <AddCommentButton range={range} />
      {inline ? <InlineComments range={range} /> : null}
    </div>
  )
}

/** List items keep their `<li>`; a loose item's paragraphs take the button instead. */
export function ShareCommentListItem({
  node,
  children,
  ...props
}: React.ComponentProps<'li'> & {
  node?: MarkdownPreviewPositionNode
}): React.JSX.Element {
  const range = useBlockRange(hasMarkdownPreviewNestedBlock(node) ? undefined : node)
  const inline = useContext(ShareCommentInlineContext)
  if (!range) {
    return <li {...props}>{children}</li>
  }
  return (
    <li {...props}>
      <div {...blockAttributes(range)} tabIndex={-1} className="orca-share-comment-block">
        {children}
        <AddCommentButton range={range} />
        {inline ? <InlineComments range={range} /> : null}
      </div>
    </li>
  )
}
