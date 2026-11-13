import React, { useContext, useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import {
  placeShareComment,
  ShareCommentPage,
  type ShareCommentPlacement
} from './share-comment-anchors'
import { useShareComments } from './share-viewer-comments-state'

export const SHARE_DRAFT_PLACEMENT_ID = 'draft'

export type ShareCommentPlacements = ReadonlyMap<string, ShareCommentPlacement>

const ShareCommentPlacementsContext = React.createContext<ShareCommentPlacements>(new Map())

/**
 * Places every comment and the draft once per layout, so underlines, the rail, inline cards and
 * the earlier-version list never disagree about where a comment is.
 */
export function ShareCommentPlacementsProvider({
  bodyRef,
  markdown,
  children
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  markdown: string
  children: React.ReactNode
}): React.JSX.Element {
  const { available, comments, draft } = useShareComments()
  const [placements, setPlacements] = useState<ShareCommentPlacements>(() => new Map())
  const [layoutRevision, setLayoutRevision] = useState(0)

  // Why: images, fonts, diagrams, the TOC and folded sections move text after first paint.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayoutRevision((revision) => revision + 1))
    })
    observer.observe(body)
    const onToggle = (): void => setLayoutRevision((revision) => revision + 1)
    body.addEventListener('toggle', onToggle, true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      body.removeEventListener('toggle', onToggle, true)
    }
  }, [bodyRef])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !available) {
      setPlacements(new Map())
      return
    }
    const page = new ShareCommentPage(body)
    const next = new Map<string, ShareCommentPlacement>()
    for (const comment of comments) {
      next.set(comment.id, placeShareComment(page, { range: comment, quote: comment.quote }))
    }
    if (draft) {
      next.set(SHARE_DRAFT_PLACEMENT_ID, placeShareComment(page, draft))
    }
    setPlacements(next)
  }, [available, bodyRef, comments, draft, markdown, layoutRevision])

  return (
    <ShareCommentPlacementsContext.Provider value={placements}>
      {children}
    </ShareCommentPlacementsContext.Provider>
  )
}

export function useShareCommentPlacements(): ShareCommentPlacements {
  return useContext(ShareCommentPlacementsContext)
}

/** The element a placed comment is about: its first text, or its block. */
export function shareCommentPlacementElement(
  placement: ShareCommentPlacement | undefined
): Element | null {
  if (!placement || placement.kind === 'unresolved') {
    return null
  }
  if (placement.kind === 'block') {
    return placement.block
  }
  const node = placement.ranges[0]?.startContainer
  return node instanceof Element ? node : (node?.parentElement ?? placement.block)
}

/** A folded `<details>` hides its text; the comment then belongs to its summary line. */
export function shareCommentFoldedSummary(element: Element | null): HTMLElement | null {
  const folded = element?.closest('details:not([open])')
  return folded?.querySelector<HTMLElement>(':scope > summary') ?? null
}

/** Viewport top of what a placed comment is about, for its card to sit level with. */
export function shareCommentPlacementTop(
  placement: ShareCommentPlacement | undefined
): number | null {
  const element = shareCommentPlacementElement(placement)
  const folded = shareCommentFoldedSummary(element)
  if (folded) {
    return folded.getBoundingClientRect().top
  }
  if (placement?.kind === 'text') {
    const first = placement.ranges[0]
    return (first?.getClientRects()[0] ?? first?.getBoundingClientRect())?.top ?? null
  }
  return element ? element.getBoundingClientRect().top : null
}
