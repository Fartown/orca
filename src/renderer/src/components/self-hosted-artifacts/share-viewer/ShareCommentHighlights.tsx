import React, { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { captureShareCommentSelection, ShareCommentPage } from './share-comment-anchors'
import { SHARE_COMMENT_ID_ATTRIBUTE } from './share-comment-blocks'
import { buildShareCommentTextMap, shareCommentTextRange } from './share-comment-text-map'
import {
  SHARE_DRAFT_PLACEMENT_ID,
  shareCommentFoldedSummary,
  shareCommentPlacementElement,
  useShareCommentPlacements,
  type ShareCommentPlacements
} from './ShareCommentPlacements'
import { useShareComments, type ShareCommentDraft } from './share-viewer-comments-state'

// Space between a line's text and its underline.
const UNDERLINE_GAP_PX = 2
// A whole-block comment's bar sits in the gutter, clear of the text; the add button covers it on hover.
const BLOCK_BAR_GUTTER_PX = 12

type Mark =
  | { key: string; id: string; kind: 'line'; left: number; top: number; width: number }
  | { key: string; id: string; kind: 'bar'; left: number; top: number; height: number }

/** Each piece of a range's text; inline code is flagged, its smaller font must not set the line. */
function textLineRects(range: Range): { rect: DOMRect; code: boolean }[] {
  const root = range.commonAncestorContainer
  const rects: { rect: DOMRect; code: boolean }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (
    let node = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode();
    node;
    node = walker.nextNode()
  ) {
    if (!range.intersectsNode(node) || !node.textContent?.trim()) {
      continue
    }
    const piece = document.createRange()
    piece.selectNodeContents(node)
    if (node === range.startContainer) {
      piece.setStart(node, range.startOffset)
    }
    if (node === range.endContainer) {
      piece.setEnd(node, range.endOffset)
    }
    const code = Boolean(node.parentElement?.closest('code'))
    for (const rect of piece.getClientRects()) {
      if (rect.width > 0) {
        rects.push({ rect, code })
      }
    }
    if (root.nodeType === Node.TEXT_NODE) {
      break
    }
  }
  return rects
}

/** One underline per visual line, just below its prose (code chips have their own padding). */
function underlineMarks(id: string, ranges: Range[], origin: DOMRect): Mark[] {
  const lines: {
    top: number
    bottom: number
    left: number
    right: number
    textBottom: number | null
    codeBottom: number
  }[] = []
  for (const { rect, code } of ranges.flatMap(textLineRects)) {
    const middle = (rect.top + rect.bottom) / 2
    const line = lines.find((candidate) => middle > candidate.top && middle < candidate.bottom)
    if (line) {
      line.left = Math.min(line.left, rect.left)
      line.right = Math.max(line.right, rect.right)
      if (code) {
        line.codeBottom = Math.max(line.codeBottom, rect.bottom)
      } else {
        line.textBottom = Math.max(line.textBottom ?? rect.bottom, rect.bottom)
      }
    } else {
      lines.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        textBottom: code ? null : rect.bottom,
        codeBottom: code ? rect.bottom : -Infinity
      })
    }
  }
  return lines.map((line, index) => ({
    key: `${id}:${index}`,
    id,
    kind: 'line',
    left: line.left - origin.left,
    top: (line.textBottom ?? line.codeBottom) - origin.top + UNDERLINE_GAP_PX,
    width: line.right - line.left
  }))
}

/** A whole block's bar spans its own text (a list item's sub-list is not part of it). */
function barMark(id: string, element: HTMLElement, origin: DOMRect): Mark {
  const map = buildShareCommentTextMap(element)
  const text = shareCommentTextRange(map, 0, map.text.length)
  const rect = text?.getBoundingClientRect() ?? element.getBoundingClientRect()
  return {
    key: `${id}:bar`,
    id,
    kind: 'bar',
    left: rect.left - origin.left - BLOCK_BAR_GUTTER_PX,
    top: rect.top - origin.top,
    height: rect.height
  }
}

function marksFor(placements: ShareCommentPlacements, origin: DOMRect): Mark[] {
  return [...placements].flatMap(([id, placement]): Mark[] => {
    const folded = shareCommentFoldedSummary(shareCommentPlacementElement(placement))
    if (folded) {
      // Text inside a folded section has no box; its summary line carries the mark.
      return [barMark(id, folded, origin)]
    }
    if (placement.kind === 'text') {
      return underlineMarks(id, placement.ranges, origin)
    }
    return placement.kind === 'block' ? [barMark(id, placement.block, origin)] : []
  })
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const position = document.caretPositionFromPoint?.(x, y)
  if (position) {
    return { node: position.offsetNode, offset: position.offset }
  }
  const range = document.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

/** Comments under a click: text comments whose text holds the caret, else whole-block ones. */
function commentsAt(placements: ShareCommentPlacements, event: MouseEvent): string[] {
  const caret = caretAt(event.clientX, event.clientY)
  const onText: string[] = []
  const onBlock: string[] = []
  for (const [id, placement] of placements) {
    if (id === SHARE_DRAFT_PLACEMENT_ID) {
      continue
    }
    if (
      placement.kind === 'text' &&
      caret &&
      placement.ranges.some((range) => range.isPointInRange(caret.node, caret.offset))
    ) {
      onText.push(id)
    } else if (
      placement.kind === 'block' &&
      event.target instanceof Node &&
      placement.block.contains(event.target)
    ) {
      onBlock.push(id)
    }
  }
  return onText.length > 0 ? onText : onBlock
}

/**
 * Marks what each comment is about: a dashed line under selected text, a bar beside a whole
 * block. Clicking marked text brings its card forward, cycling through comments that overlap.
 */
export function ShareCommentHighlights({
  bodyRef
}: {
  bodyRef: RefObject<HTMLDivElement | null>
}): React.JSX.Element | null {
  const { draft, activeCommentId, setActiveCommentId, attentionCommentId, flashComment } =
    useShareComments()
  const placements = useShareCommentPlacements()
  const [marks, setMarks] = useState<Mark[]>([])

  useLayoutEffect(() => {
    const body = bodyRef.current
    setMarks(body ? marksFor(placements, body.getBoundingClientRect()) : [])
  }, [bodyRef, placements])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const onClick = (event: MouseEvent): void => {
      if (window.getSelection()?.isCollapsed === false) {
        return
      }
      const ids = commentsAt(placements, event)
      if (ids.length === 0) {
        return
      }
      const current = activeCommentId ? ids.indexOf(activeCommentId) : -1
      const id = ids[(current + 1) % ids.length] ?? ids[0]
      if (!id) {
        return
      }
      setActiveCommentId(id)
      flashComment(id)
      body
        .querySelector(`[${SHARE_COMMENT_ID_ATTRIBUTE}="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    body.addEventListener('click', onClick)
    return () => body.removeEventListener('click', onClick)
  }, [activeCommentId, bodyRef, flashComment, placements, setActiveCommentId])

  if (marks.length === 0) {
    return null
  }
  const active = draft ? SHARE_DRAFT_PLACEMENT_ID : activeCommentId
  // Why sorted: the emphasized comment paints last, over any comment sharing its text.
  const ordered = [...marks].sort(
    (left, right) => Number(left.id === active) - Number(right.id === active)
  )
  return (
    <div className="orca-share-comment-marks" aria-hidden="true">
      {ordered.map((mark) => (
        <span
          key={mark.key}
          className={[
            mark.kind === 'line' ? 'is-line' : 'is-bar',
            mark.id === active ? 'is-active' : '',
            mark.id === attentionCommentId ? 'is-attention' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          style={
            mark.kind === 'line'
              ? { left: mark.left, top: mark.top, width: mark.width }
              : { left: mark.left, top: mark.top, height: mark.height }
          }
        />
      ))}
    </div>
  )
}

type SelectionTarget = { draft: ShareCommentDraft; top: number; left: number }

/** The selection's text, its offsets in the blocks it covers and its exact source lines. */
function readSelection(body: HTMLElement): SelectionTarget | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  if (!range.intersectsNode(body)) {
    return null
  }
  const draft = captureShareCommentSelection(new ShareCommentPage(body), range)
  if (!draft) {
    return null
  }
  const rects = range.getClientRects()
  const anchor = [...rects].at(-1) ?? range.getBoundingClientRect()
  return {
    draft,
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
    // Why follow the scroll: the selection stays, so its button must stay under it.
    const scroller = scrollRef.current
    document.addEventListener('selectionchange', update)
    scroller?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
      scroller?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
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
