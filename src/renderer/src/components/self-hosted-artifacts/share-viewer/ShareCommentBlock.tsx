import React, { useCallback, useContext, useState } from 'react'
import { revealMarkdownNavigationDetails } from '@/components/editor/markdown-navigation-details'
import { getMarkdownReviewAnchorLabel } from '@/components/markdown-review-anchor-recovery/review-anchor-position'
import { CornerDownLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { captureShareCommentBlock, type ShareCommentPlacement } from './share-comment-anchors'
import {
  SHARE_COMMENT_BLOCK_ATTRIBUTE,
  SHARE_COMMENT_CHROME_ATTRIBUTE,
  SHARE_COMMENT_ID_ATTRIBUTE
} from './share-comment-blocks'
import {
  SHARE_DRAFT_PLACEMENT_ID,
  shareCommentPlacementElement,
  useShareCommentPlacements
} from './ShareCommentPlacements'
import { useShareComments, type ShareCommentRange } from './share-viewer-comments-state'

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

/** The app's review-note card; a link carries no identity, so any reader may edit or delete. */
export function ShareCommentCard({
  comment,
  onContentResize
}: {
  comment: ArtifactShareComment
  onContentResize?: () => void
}): React.JSX.Element {
  const { editComment, deleteComment } = useShareComments()
  const placements = useShareCommentPlacements()
  return (
    <DiffCommentCard
      lineNumber={comment.endLine}
      startLine={comment.startLine === comment.endLine ? undefined : comment.startLine}
      // Same as the app's notes: a note whose text is gone says so.
      label={getMarkdownReviewAnchorLabel(placements.get(comment.id)?.kind === 'unresolved')}
      // Why the time in the author slot: the card's header shows no name, and no "Note" fallback.
      author={formatCommentTime(comment.updatedAt ?? comment.createdAt)}
      quote={formatMarkdownReviewCardQuote(comment.quote)}
      body={comment.body}
      onDelete={() => void deleteComment(comment.id)}
      onSubmitEdit={(body) => editComment(comment.id, body)}
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

/** As the app's review rail does: center the note's text in the view (opening folded sections). */
function revealCommentSource(placement: ShareCommentPlacement | undefined): boolean {
  const element = shareCommentPlacementElement(placement)
  if (!(element instanceof HTMLElement) || !placement || placement.kind === 'unresolved') {
    return false
  }
  revealMarkdownNavigationDetails(element)
  const scroller = element.closest<HTMLElement>('.markdown-preview')
  if (!scroller) {
    return false
  }
  const first = placement.kind === 'text' ? placement.ranges[0] : undefined
  const last = placement.kind === 'text' ? placement.ranges.at(-1) : undefined
  const top = (first ?? element).getBoundingClientRect().top
  const bottom = (last ?? element).getBoundingClientRect().bottom
  const view = scroller.getBoundingClientRect()
  scroller.scrollTo({
    top: Math.max(
      0,
      scroller.scrollTop + (top + bottom) / 2 - view.top - scroller.clientHeight / 2
    ),
    behavior: 'smooth'
  })
  return true
}

/** Hover on a card emphasizes the text it is about; a click also brings that text into view. */
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
  const { activeCommentId, setActiveCommentId, attentionCommentId, flashComment } =
    useShareComments()
  const placements = useShareCommentPlacements()
  const state = [
    activeCommentId === comment.id ? 'is-active' : '',
    attentionCommentId === comment.id ? 'is-attention' : ''
  ]
  return (
    <div
      ref={frameRef}
      {...{ [SHARE_COMMENT_ID_ATTRIBUTE]: comment.id, 'data-share-rail-id': comment.id }}
      className={[className, ...state].filter(Boolean).join(' ')}
      style={style}
      onMouseEnter={() => setActiveCommentId(comment.id)}
      onMouseLeave={() => setActiveCommentId(null)}
      onClick={(event) => {
        event.stopPropagation()
        setActiveCommentId(comment.id)
        if (!isCardControl(event.target) && revealCommentSource(placements.get(comment.id))) {
          flashComment(comment.id)
        }
      }}
    >
      {children}
    </div>
  )
}

export function ShareCommentComposer(): React.JSX.Element {
  const { submit, cancelDraft, draft } = useShareComments()
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
    const failure = await submit(body.trim())
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

/** On narrow pages there is no rail, so the composer and cards follow the block they are on. */
function InlineComments({ block }: { block: HTMLElement | null }): React.JSX.Element | null {
  const { comments } = useShareComments()
  const placements = useShareCommentPlacements()
  const onBlock = (id: string): boolean => {
    const placement = placements.get(id)
    return Boolean(block && placement?.block === block)
  }
  const own = comments.filter((comment) => onBlock(comment.id))
  const composing = onBlock(SHARE_DRAFT_PLACEMENT_ID)
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

/** Comments on the whole block; a second press closes the draft it opened. */
function AddCommentButton({ block }: { block: HTMLElement | null }): React.JSX.Element {
  const { draft, startDraft, cancelDraft } = useShareComments()
  const placements = useShareCommentPlacements()
  const draftPlacement = placements.get(SHARE_DRAFT_PLACEMENT_ID)
  const composing =
    draft?.wholeBlock === true &&
    draftPlacement !== undefined &&
    draftPlacement.kind !== 'unresolved' &&
    draftPlacement.block === block
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
        } else if (block) {
          startDraft(captureShareCommentBlock(block))
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

/** The block wrapper the rest of the page finds comments by: its source lines and add button. */
function CommentableBlock({
  range,
  children
}: {
  range: ShareCommentRange
  children: React.ReactNode
}): React.JSX.Element {
  const inline = useContext(ShareCommentInlineContext)
  const [block, setBlock] = useState<HTMLElement | null>(null)
  return (
    // Why tabIndex: on touch screens focusing the block is what reveals its add button.
    <div
      ref={setBlock}
      {...blockAttributes(range)}
      tabIndex={-1}
      className="orca-share-comment-block"
    >
      {children}
      <AddCommentButton block={block} />
      {inline ? <InlineComments block={block} /> : null}
    </div>
  )
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
  return range ? <CommentableBlock range={range}>{children}</CommentableBlock> : <>{children}</>
}

const LIST_TAGS = new Set(['ul', 'ol'])
const LOOSE_ITEM_TAGS = new Set(['p', 'pre', 'table', 'blockquote'])

/**
 * A list item's own lines: a tight item with a sub-list owns the lines before it, so its text is
 * commentable while each sub-item stays its own block. Loose items leave it to their paragraphs.
 */
function listItemOwnRange(node: MarkdownPreviewPositionNode | undefined): ShareCommentRange | null {
  const range = getMarkdownPreviewBlockRange(node)
  if (!range || !hasMarkdownPreviewNestedBlock(node)) {
    return range
  }
  const children = node?.children ?? []
  if (children.some((child) => child.tagName && LOOSE_ITEM_TAGS.has(child.tagName))) {
    return null
  }
  const firstList = children.find((child) => child.tagName && LIST_TAGS.has(child.tagName))
  const listLine = firstList?.position?.start?.line
  return typeof listLine === 'number' && listLine > range.startLine
    ? { startLine: range.startLine, endLine: listLine - 1 }
    : null
}

/** List items keep their `<li>`; the wrapper sits inside it. */
export function ShareCommentListItem({
  node,
  children,
  ...props
}: React.ComponentProps<'li'> & {
  node?: MarkdownPreviewPositionNode
}): React.JSX.Element {
  const { available } = useShareComments()
  const range = available ? listItemOwnRange(node) : null
  if (!range) {
    return <li {...props}>{children}</li>
  }
  return (
    <li {...props}>
      <CommentableBlock range={range}>{children}</CommentableBlock>
    </li>
  )
}
