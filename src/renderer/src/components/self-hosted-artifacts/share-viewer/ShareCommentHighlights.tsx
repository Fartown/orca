import React, { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  createDomTextSearchHighlights,
  findDomTextSearchRanges,
  type DomTextSearchInstance
} from '@/lib/dom-text-search-highlights'
import { ARTIFACT_SHARE_COMMENT_LIMITS } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  findShareCommentBlocks,
  readShareCommentBlockRange,
  SHARE_COMMENT_BLOCK_SELECTOR,
  SHARE_COMMENT_CHROME_ATTRIBUTE,
  SHARE_COMMENT_ID_ATTRIBUTE
} from './share-comment-blocks'
import { useShareComments, type ShareCommentDraft } from './share-viewer-comments-state'

// Names match the ::highlight() rules in viewer.css.
const highlights = createDomTextSearchHighlights({
  match: 'share-comment',
  active: 'share-comment-active'
})
const HIGHLIGHTS: DomTextSearchInstance = {}
const DRAFT_ID = 'draft'

function isCommentChrome(element: HTMLElement): boolean {
  return element.closest(`[${SHARE_COMMENT_CHROME_ATTRIBUTE}]`) !== null
}

/** Each selected line is found in the blocks it came from; a whole-block comment paints its text. */
function rangesForComment(body: HTMLElement, draft: ShareCommentDraft): Range[] {
  const blocks = findShareCommentBlocks(body, draft.range)
  const scope = { rejectElement: isCommentChrome, joinedTextSelector: SHARE_COMMENT_BLOCK_SELECTOR }
  const pieces = (draft.quote ?? '')
    .split(/\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  const found = pieces.flatMap((piece) => {
    for (const block of blocks) {
      const match = findDomTextSearchRanges(block, piece, scope)[0]
      if (match) {
        return [match]
      }
    }
    return []
  })
  if (found.length > 0) {
    return found
  }
  // The file changed, or the comment names a whole block: mark everything it covers.
  return blocks.flatMap((block) => findWholeBlockText(block))
}

/** Viewport top of the text a comment is about, so its rail card can sit level with it. */
export function findShareCommentAnchor(body: HTMLElement, draft: ShareCommentDraft): number | null {
  const first = rangesForComment(body, draft)[0]
  const rect = first?.getClientRects()[0] ?? first?.getBoundingClientRect()
  if (rect) {
    return rect.top
  }
  const block = findShareCommentBlocks(body, draft.range)[0]
  return block ? block.getBoundingClientRect().top : null
}

function findWholeBlockText(block: HTMLElement): Range[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && !isCommentChrome(node.parentElement) && node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
  })
  const first = walker.nextNode()
  let last = first
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    last = next
  }
  if (!first || !last) {
    return []
  }
  const range = document.createRange()
  range.setStart(first, 0)
  range.setEnd(last, last.textContent?.length ?? 0)
  return [range]
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const position = document.caretPositionFromPoint?.(x, y)
  if (position) {
    return { node: position.offsetNode, offset: position.offset }
  }
  const range = document.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

/**
 * Marks the text each comment is about with the app's review-note color. Clicking marked text
 * brings its card forward; hovering a card brightens its text.
 */
export function ShareCommentHighlights({
  bodyRef,
  markdown
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  markdown: string
}): null {
  const { available, comments, draft, activeCommentId, setActiveCommentId } = useShareComments()
  const rangesById = useRef(new Map<string, Range[]>())

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !available) {
      return
    }
    const next = new Map<string, Range[]>()
    for (const comment of comments) {
      next.set(comment.id, rangesForComment(body, { range: comment, quote: comment.quote }))
    }
    if (draft) {
      next.set(DRAFT_ID, rangesForComment(body, draft))
    }
    rangesById.current = next
    highlights.setMatches(HIGHLIGHTS, [...next.values()].flat())
    return () => highlights.clear(HIGHLIGHTS)
  }, [available, bodyRef, comments, draft, markdown])

  useEffect(() => {
    const active = draft ? DRAFT_ID : activeCommentId
    const ranges = active ? rangesById.current.get(active) : undefined
    // One active range is painted; a multi-line selection shows its first line brightest.
    highlights.setActive(HIGHLIGHTS, ranges?.[0])
  }, [activeCommentId, draft, comments])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const onClick = (event: MouseEvent): void => {
      if (window.getSelection()?.isCollapsed === false) {
        return
      }
      const caret = caretAt(event.clientX, event.clientY)
      if (!caret) {
        return
      }
      for (const [id, ranges] of rangesById.current) {
        if (
          id !== DRAFT_ID &&
          ranges.some((range) => range.isPointInRange(caret.node, caret.offset))
        ) {
          setActiveCommentId(id)
          body
            .querySelector(`[${SHARE_COMMENT_ID_ATTRIBUTE}="${id}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          return
        }
      }
    }
    body.addEventListener('click', onClick)
    return () => body.removeEventListener('click', onClick)
  }, [bodyRef, setActiveCommentId])

  return null
}

type SelectionTarget = { draft: ShareCommentDraft; top: number; left: number }

/** The selection's blocks give its source lines; its text becomes the comment's exact quote. */
function readSelection(body: HTMLElement): SelectionTarget | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  const startElement =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement
  const endElement =
    range.endContainer instanceof HTMLElement
      ? range.endContainer
      : range.endContainer.parentElement
  const startBlock = startElement?.closest<HTMLElement>(SHARE_COMMENT_BLOCK_SELECTOR)
  const endBlock = endElement?.closest<HTMLElement>(SHARE_COMMENT_BLOCK_SELECTOR)
  if (
    !startBlock ||
    !endBlock ||
    !body.contains(startBlock) ||
    !body.contains(endBlock) ||
    (startElement && isCommentChrome(startElement)) ||
    (endElement && isCommentChrome(endElement))
  ) {
    return null
  }
  const quote = selection.toString().trim().slice(0, ARTIFACT_SHARE_COMMENT_LIMITS.quote)
  if (!quote) {
    return null
  }
  const rects = range.getClientRects()
  const anchor = [...rects].at(-1) ?? range.getBoundingClientRect()
  return {
    draft: {
      range: {
        startLine: readShareCommentBlockRange(startBlock).startLine,
        endLine: readShareCommentBlockRange(endBlock).endLine
      },
      quote
    },
    top: anchor.bottom + 6,
    left: Math.max(8, Math.min(anchor.right - 40, window.innerWidth - 120))
  }
}

/** A floating "Comment" button under any text the reader selects in the document. */
export function ShareSelectionCommentButton({
  bodyRef,
  scrollRef
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
}): React.JSX.Element | null {
  const { available, startDraft } = useShareComments()
  const [target, setTarget] = useState<SelectionTarget | null>(null)
  const label = useMemo(
    () => translate('auto.components.selfHostedArtifacts.shareViewer.commentSelection', 'Comment'),
    []
  )

  useEffect(() => {
    if (!available) {
      return
    }
    let frame = 0
    const update = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const body = bodyRef.current
        setTarget(body ? readSelection(body) : null)
      })
    }
    const hide = (): void => setTarget(null)
    const scroller = scrollRef.current
    document.addEventListener('selectionchange', update)
    scroller?.addEventListener('scroll', hide, { passive: true })
    window.addEventListener('resize', hide)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
      scroller?.removeEventListener('scroll', hide)
      window.removeEventListener('resize', hide)
    }
  }, [available, bodyRef, scrollRef])

  if (!target) {
    return null
  }
  return (
    <div
      className="fixed z-40 rounded-md shadow-floating"
      style={{ top: target.top, left: target.left }}
    >
      <Button
        size="sm"
        // Why pointerdown: by click time a tap has collapsed the selection and removed this button.
        onPointerDown={(event) => {
          event.preventDefault()
          startDraft(target.draft)
          window.getSelection()?.removeAllRanges()
          setTarget(null)
        }}
      >
        <MessageSquarePlus />
        {label}
      </Button>
    </div>
  )
}
