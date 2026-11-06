import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react'
import { translate } from '@/i18n/i18n'
import {
  stackRichMarkdownReviewNotePositions,
  type RichMarkdownReviewNotePosition
} from '@/components/editor/rich-markdown-review-note-layout'
import type { DiffComment } from '../../../../../shared/diff-comment-types'
import { ShareCommentCard, ShareCommentCardFrame, ShareCommentComposer } from './ShareCommentBlock'
import { findShareCommentAnchor } from './ShareCommentHighlights'
import { findShareCommentHomeBlock } from './share-comment-blocks'
import { useShareComments, type ShareCommentDraft } from './share-viewer-comments-state'

const DRAFT_ID = 'draft'

/** The rich editor's stacking takes review notes; a share comment maps onto one field for field. */
function toReviewNote(
  id: string,
  draft: ShareCommentDraft,
  body: string,
  createdAt: number
): DiffComment {
  return {
    id,
    worktreeId: 'share',
    filePath: 'share',
    source: 'markdown',
    startLine: draft.range.startLine,
    lineNumber: draft.range.endLine,
    body,
    createdAt,
    side: 'modified'
  }
}

/**
 * Cards sit in a rail beside the text, each level with what it is about, like the rich editor's
 * review notes; the prose keeps its own spacing however many comments there are.
 */
export function ShareCommentRail({
  bodyRef
}: {
  bodyRef: RefObject<HTMLDivElement | null>
}): React.JSX.Element | null {
  const { comments, draft } = useShareComments()
  const [positions, setPositions] = useState<RichMarkdownReviewNotePosition[]>([])
  const heights = useRef(new Map<string, number>())
  const cards = useRef(new Map<string, HTMLElement>())
  const [layoutRevision, setLayoutRevision] = useState(0)
  const relayout = useCallback(() => setLayoutRevision((revision) => revision + 1), [])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const bodyTop = body.getBoundingClientRect().top
    const anchored: RichMarkdownReviewNotePosition[] = []
    for (const comment of comments) {
      // Orphans (the file changed under them) are listed after the document instead.
      if (findShareCommentHomeBlock(body, comment) === null) {
        continue
      }
      const draftShape = { range: comment, quote: comment.quote }
      const top = findShareCommentAnchor(body, draftShape)
      if (top !== null) {
        anchored.push({
          comment: toReviewNote(
            comment.id,
            draftShape,
            comment.body,
            Date.parse(comment.createdAt)
          ),
          top: top - bodyTop
        })
      }
    }
    const draftTop = draft ? findShareCommentAnchor(body, draft) : null
    if (draft && draftTop !== null) {
      // Why Infinity: at the same line a new draft stacks after the comments already there.
      anchored.push({
        comment: toReviewNote(DRAFT_ID, draft, '', Infinity),
        top: draftTop - bodyTop
      })
    }
    setPositions(stackRichMarkdownReviewNotePositions(anchored, heights.current))
  }, [bodyRef, comments, draft, layoutRevision])

  // Why: images, fonts and diagrams settle after first paint and move every anchor below them.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const observer = new ResizeObserver(relayout)
    observer.observe(body)
    return () => observer.disconnect()
  }, [bodyRef, relayout])

  const [cardObserver] = useState(
    () =>
      new ResizeObserver((entries) => {
        let changed = false
        for (const entry of entries) {
          const id = entry.target instanceof HTMLElement ? entry.target.dataset.shareRailId : null
          const height = Math.ceil(entry.borderBoxSize[0]?.blockSize ?? 0)
          if (id && heights.current.get(id) !== height) {
            heights.current.set(id, height)
            changed = true
          }
        }
        if (changed) {
          relayout()
        }
      })
  )
  useEffect(() => () => cardObserver.disconnect(), [cardObserver])

  const trackCard = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      const previous = cards.current.get(id)
      if (previous && previous !== element) {
        cardObserver.unobserve(previous)
        cards.current.delete(id)
        heights.current.delete(id)
      }
      if (element) {
        cards.current.set(id, element)
        cardObserver.observe(element)
      }
    },
    [cardObserver]
  )

  if (positions.length === 0) {
    return null
  }
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  return (
    <div
      className="rich-markdown-review-note-layer"
      aria-label={translate('auto.components.selfHostedArtifacts.shareViewer.comments', 'Comments')}
    >
      {positions.map(({ comment: { id }, top }) => {
        if (id === DRAFT_ID) {
          return (
            <div
              key={id}
              ref={trackCard(id)}
              data-share-rail-id={id}
              className="rich-markdown-review-note-card"
              style={{ top }}
            >
              <ShareCommentComposer />
            </div>
          )
        }
        const comment = byId.get(id)
        return comment ? (
          <ShareCommentCardFrame
            key={id}
            comment={comment}
            frameRef={trackCard(id)}
            className="rich-markdown-review-note-card"
            style={{ top }}
          >
            <ShareCommentCard comment={comment} />
          </ShareCommentCardFrame>
        ) : null
      })}
    </div>
  )
}
