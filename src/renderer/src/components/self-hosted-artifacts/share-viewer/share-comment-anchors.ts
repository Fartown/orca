import { getRichMarkdownLineRangeFromBlocks } from '@/components/editor/rich-markdown-range-bounds'
import { ARTIFACT_SHARE_COMMENT_LIMITS } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import { readShareCommentBlockRange, SHARE_COMMENT_BLOCK_SELECTOR } from './share-comment-blocks'
import {
  buildShareCommentTextMap,
  shareCommentTextEnd,
  shareCommentTextRange,
  shareCommentTextStart,
  type ShareCommentTextMap
} from './share-comment-text-map'
import type { ShareCommentDraft } from './share-viewer-comments-state'

/**
 * Where a comment lands, by the rules of the app's review notes: on its selected text, on its
 * block when it quotes nothing, or unresolved ("Original text changed") when its text is gone.
 */
export type ShareCommentPlacement =
  | { kind: 'text'; block: HTMLElement; ranges: Range[] }
  | { kind: 'block'; block: HTMLElement }
  /** The text is gone; `block` holds its last line, where the app's preview lists such notes. */
  | { kind: 'unresolved'; block: HTMLElement | null }

export type ShareCommentTarget = Pick<ShareCommentDraft, 'range' | 'quote'>

/** Blocks share text maps for one layout pass; text maps hold live DOM positions. */
export class ShareCommentPage {
  readonly blocks: HTMLElement[]
  private readonly maps = new Map<HTMLElement, ShareCommentTextMap>()

  constructor(body: HTMLElement) {
    this.blocks = [...body.querySelectorAll<HTMLElement>(SHARE_COMMENT_BLOCK_SELECTOR)]
  }

  map(block: HTMLElement): ShareCommentTextMap {
    let map = this.maps.get(block)
    if (!map) {
      map = buildShareCommentTextMap(block)
      this.maps.set(block, map)
    }
    return map
  }
}

// The app's review notes compare selected text with runs of whitespace collapsed to one space.
function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** A note's line range, as the app takes it: from the first block the selection touches to the last. */
function lineRangeOf(blocks: readonly HTMLElement[]): ShareCommentDraft['range'] | null {
  const range = getRichMarkdownLineRangeFromBlocks(blocks.map(readShareCommentBlockRange))
  return range
    ? { startLine: range.startLine ?? range.lineNumber, endLine: range.lineNumber }
    : null
}

/** The note a text selection makes: the blocks it touches and the text the reader sees selected. */
export function captureShareCommentSelection(
  page: ShareCommentPage,
  selection: Range
): ShareCommentDraft | null {
  const blocks: HTMLElement[] = []
  const texts: string[] = []
  for (const block of page.blocks) {
    if (!selection.intersectsNode(block)) {
      continue
    }
    const map = page.map(block)
    const start = shareCommentTextStart(map, selection.startContainer, selection.startOffset)
    const end = shareCommentTextEnd(map, selection.endContainer, selection.endOffset)
    const text = map.text.slice(start, end).trim()
    if (text) {
      blocks.push(block)
      texts.push(text)
    }
  }
  const range = lineRangeOf(blocks)
  const quote = normalizeQuote(texts.join(' '))
  return range && quote
    ? { range, quote: quote.slice(0, ARTIFACT_SHARE_COMMENT_LIMITS.quote) }
    : null
}

/** A note on a whole block, as the app's preview makes it: the block's text is its quote. */
export function captureShareCommentBlock(block: HTMLElement): ShareCommentDraft {
  const quote = normalizeQuote(buildShareCommentTextMap(block).text)
  return {
    range: readShareCommentBlockRange(block),
    ...(quote ? { quote: quote.slice(0, ARTIFACT_SHARE_COMMENT_LIMITS.quote) } : {}),
    wholeBlock: true
  }
}

/** The innermost block holding a line, as the app finds a note's block by its last line. */
function blockAtLine(page: ShareCommentPage, line: number): HTMLElement | null {
  return (
    page.blocks.findLast((block) => {
      const range = readShareCommentBlockRange(block)
      return range.startLine <= line && line <= range.endLine
    }) ?? null
  )
}

/** The first occurrence of the quote across `blocks` (joined by one space), as DOM ranges. */
function findFirst(
  page: ShareCommentPage,
  blocks: readonly HTMLElement[],
  quote: string
): { block: HTMLElement; ranges: Range[] } | null {
  const spans: { block: HTMLElement; map: ShareCommentTextMap; from: number }[] = []
  let text = ''
  for (const block of blocks) {
    const map = page.map(block)
    if (!map.text) {
      continue
    }
    if (text) {
      text += ' '
    }
    spans.push({ block, map, from: text.length })
    text += map.text
  }
  const start = text.indexOf(quote)
  if (start === -1) {
    return null
  }
  const end = start + quote.length
  const ranges: Range[] = []
  let first: HTMLElement | null = null
  for (const span of spans) {
    const from = Math.max(start, span.from) - span.from
    const to = Math.min(end, span.from + span.map.text.length) - span.from
    const range = from < to ? shareCommentTextRange(span.map, from, to) : null
    if (range) {
      first ??= span.block
      ranges.push(range)
    }
  }
  return first ? { block: first, ranges } : null
}

/**
 * Places a note the way the app's rich editor does: its selected text in the block holding its
 * last line, else the first match anywhere; with no selected text, its block.
 */
export function placeShareComment(
  page: ShareCommentPage,
  target: ShareCommentTarget
): ShareCommentPlacement {
  const home = blockAtLine(page, target.range.endLine)
  const quote = normalizeQuote(target.quote ?? '')
  if (!quote) {
    return home ? { kind: 'block', block: home } : { kind: 'unresolved', block: null }
  }
  const found =
    (home ? findFirst(page, [home], quote) : null) ?? findFirst(page, page.blocks, quote)
  return found ? { kind: 'text', ...found } : { kind: 'unresolved', block: home }
}
