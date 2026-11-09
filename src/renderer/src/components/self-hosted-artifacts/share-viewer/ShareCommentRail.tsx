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
import {
  SHARE_DRAFT_PLACEMENT_ID,
  shareCommentPlacementTop,
  useShareCommentPlacements
} from './ShareCommentPlacements'
import { useShareComments, type ShareCommentDraft } from './share-viewer-comments-state'

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
  const placements = useShareCommentPlacements()
  const [positions, setPositions] = useState<RichMarkdownReviewNotePosition[]>([])
  const heights = useRef(new Map<string, number>())
  const [heightRevision, setHeightRevision] = useState(0)

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const bodyTop = body.getBoundingClientRect().top
    const anchored: RichMarkdownReviewNotePosition[] = []
    for (const comment of comments) {
      // Orphans (their text is gone from the file) are listed after the document instead.
      const top = shareCommentPlacementTop(placements.get(comment.id))
      if (top !== null) {
        anchored.push({
          comment: toReviewNote(
            comment.id,
            { range: comment },
            comment.body,
            Date.parse(comment.createdAt)
          ),
          top: top - bodyTop
        })
      }
    }
    const draftTop = draft
      ? shareCommentPlacementTop(placements.get(SHARE_DRAFT_PLACEMENT_ID))
      : null
    if (draft && draftTop !== null) {
      // Why Infinity: at the same line a new draft stacks after the comments already there.
      anchored.push({
        comment: toReviewNote(SHARE_DRAFT_PLACEMENT_ID, draft, '', Infinity),
        top: draftTop - bodyTop
      })
    }
    setPositions(stackRichMarkdownReviewNotePositions(anchored, heights.current))
  }, [bodyRef, comments, draft, placements, heightRevision])

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
          setHeightRevision((revision) => revision + 1)
        }
      })
  )
  useEffect(() => () => cardObserver.disconnect(), [cardObserver])

  // Why cached per id: a fresh ref callback each render would re-observe every card each time.
  const cardRefs = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const trackCard = useCallback(
    (id: string) => {
      let callback = cardRefs.current.get(id)
      if (!callback) {
        let observed: HTMLElement | null = null
        callback = (element) => {
          if (observed && observed !== element) {
            cardObserver.unobserve(observed)
            heights.current.delete(id)
          }
          observed = element
          if (element) {
            cardObserver.observe(element)
          } else {
            cardRefs.current.delete(id)
          }
        }
        cardRefs.current.set(id, callback)
      }
      return callback
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
        if (id === SHARE_DRAFT_PLACEMENT_ID) {
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
