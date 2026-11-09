import {
  ARTIFACT_SHARE_COMMENT_LIMITS,
  type ArtifactShareCommentAnchor
} from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import { readShareCommentBlockRange, SHARE_COMMENT_BLOCK_SELECTOR } from './share-comment-blocks'
import {
  buildShareCommentTextMap,
  shareCommentTextEnd,
  shareCommentTextPoint,
  shareCommentTextRange,
  shareCommentTextStart,
  type ShareCommentTextMap
} from './share-comment-text-map'
import type { ShareCommentDraft } from './share-viewer-comments-state'

/** Where a comment lands on the page now: on text, on a whole block, or nowhere (file changed). */
export type ShareCommentPlacement =
  | { kind: 'text'; block: HTMLElement; ranges: Range[] }
  | { kind: 'block'; block: HTMLElement }
  | { kind: 'orphan' }

/** What a comment or draft carries to be placed. */
export type ShareCommentTarget = Pick<ShareCommentDraft, 'range' | 'quote' | 'anchor'>

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

function blockLine(block: HTMLElement): number {
  return readShareCommentBlockRange(block).startLine
}

/**
 * The source line a character of a block is on: a table row names its own line, a code block
 * counts newlines after its fence, other blocks count line breaks (each source line renders one).
 */
function sourceLineAt(block: HTMLElement, map: ShareCommentTextMap, index: number): number {
  const { startLine, endLine } = readShareCommentBlockRange(block)
  const point = shareCommentTextPoint(map, index)
  if (!point) {
    return startLine
  }
  const row = point.node.parentElement?.closest<HTMLElement>('tr[data-source-line]')
  const code = point.node.parentElement?.closest('pre')
  let line = startLine
  if (row && block.contains(row)) {
    line = Number(row.dataset.sourceLine)
  } else if (code && block.contains(code)) {
    const before = document.createRange()
    before.setStart(code, 0)
    before.setEnd(point.node, point.offset)
    line = startLine + 1 + (before.toString().match(/\n/g)?.length ?? 0)
  } else {
    const before = document.createRange()
    before.setStart(block, 0)
    before.setEnd(point.node, point.offset)
    line = startLine + before.cloneContents().querySelectorAll('br').length
  }
  return Math.min(endLine, Math.max(startLine, Number.isFinite(line) ? line : startLine))
}

/**
 * The comment a selection describes: each block it covers contributes the characters inside it,
 * so a selection that starts on a list marker or between paragraphs snaps onto the text.
 */
export function captureShareCommentSelection(
  page: ShareCommentPage,
  selection: Range
): ShareCommentDraft | null {
  const parts: { block: HTMLElement; map: ShareCommentTextMap; start: number; end: number }[] = []
  for (const block of page.blocks) {
    if (!selection.intersectsNode(block)) {
      continue
    }
    const map = page.map(block)
    const start = shareCommentTextStart(map, selection.startContainer, selection.startOffset)
    const end = shareCommentTextEnd(map, selection.endContainer, selection.endOffset)
    const text = map.text.slice(start, end).trim()
    if (text) {
      // Why trim offsets too: a selection ending past a word must not anchor on a separator.
      const lead = map.text.slice(start, end).length - map.text.slice(start, end).trimStart().length
      parts.push({ block, map, start: start + lead, end: start + lead + text.length })
    }
  }
  const first = parts[0]
  const last = parts.at(-1)
  if (!first || !last) {
    return null
  }
  const quote = parts.map((part) => part.map.text.slice(part.start, part.end)).join('\n')
  const context = uniqueContext(first.map.text, first.start, first.end)
  return {
    range: {
      startLine: sourceLineAt(first.block, first.map, first.start),
      endLine: sourceLineAt(last.block, last.map, last.end - 1)
    },
    quote: quote.slice(0, ARTIFACT_SHARE_COMMENT_LIMITS.quote),
    anchor: {
      line: blockLine(first.block),
      offset: first.start,
      length: quote.length,
      ...(context ? { context } : {})
    }
  }
}

function occurrences(text: string, needle: string): number {
  let count = 0
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    count += 1
  }
  return count
}

const CONTEXT_LIMIT = 200

/**
 * The fewest characters before [start, end) that make it occur once in its block, or '' when it
 * already does. Orca's review notes find their text by its first match, so a repeated word needs
 * this to land on the reader's occurrence there too.
 */
function uniqueContext(text: string, start: number, end: number): string {
  let from = start
  while (from > 0 && start - from < CONTEXT_LIMIT && occurrences(text, text.slice(from, end)) > 1) {
    from -= 1
  }
  return text.slice(from, start)
}

/** A comment on a whole block: its text is the quote, so a changed file can still be checked. */
export function captureShareCommentBlock(block: HTMLElement): ShareCommentDraft {
  const text = buildShareCommentTextMap(block).text
  return {
    range: readShareCommentBlockRange(block),
    ...(text ? { quote: text.slice(0, ARTIFACT_SHARE_COMMENT_LIMITS.quote) } : {}),
    anchor: { line: blockLine(block), offset: 0, length: text.length, whole: true }
  }
}

/** Ranges for `length` characters from `offset` in `blocks[index]`, continuing into the next blocks. */
function rangesFrom(
  page: ShareCommentPage,
  index: number,
  offset: number,
  length: number
): { ranges: Range[]; text: string } | null {
  const ranges: Range[] = []
  const parts: string[] = []
  let remaining = length
  let at = offset
  for (let blockIndex = index; blockIndex < page.blocks.length && remaining > 0; blockIndex += 1) {
    const block = page.blocks[blockIndex]
    const map = block ? page.map(block) : null
    if (!map || (map.text.length === 0 && blockIndex !== index)) {
      continue
    }
    const take = Math.min(remaining, map.text.length - at)
    if (take <= 0) {
      return null
    }
    parts.push(map.text.slice(at, at + take))
    const range = shareCommentTextRange(map, at, at + take)
    if (range) {
      ranges.push(range)
    }
    // The join between two blocks counts as one character of the anchor's length.
    remaining -= take + 1
    at = 0
  }
  return remaining > 0 ? null : { ranges, text: parts.join('\n') }
}

/** Every place in the page where the quote's text occurs, as block index and offset. */
function findQuote(page: ShareCommentPage, quote: string): { index: number; offset: number }[] {
  const [head, ...rest] = quote.split('\n')
  if (!head) {
    return []
  }
  const found: { index: number; offset: number }[] = []
  page.blocks.forEach((block, index) => {
    const text = page.map(block).text
    if (rest.length > 0) {
      // A quote over several blocks ends the first one; the rest must follow in order.
      if (text.endsWith(head)) {
        found.push({ index, offset: text.length - head.length })
      }
      return
    }
    for (let at = text.indexOf(head); at !== -1; at = text.indexOf(head, at + 1)) {
      found.push({ index, offset: at })
    }
  })
  return found
}

/** Places a comment: at its anchor when the text there still matches, else at the nearest match. */
export function placeShareComment(
  page: ShareCommentPage,
  target: ShareCommentTarget
): ShareCommentPlacement {
  const { anchor, quote } = target
  if (anchor?.whole) {
    return placeWholeBlock(page, anchor, quote)
  }
  if (!quote) {
    // Comments left before anchors existed name only their lines; their block still holds them.
    const block = page.blocks.findLast((candidate) => {
      const lines = readShareCommentBlockRange(candidate)
      return lines.startLine <= target.range.endLine && target.range.endLine <= lines.endLine
    })
    return block ? { kind: 'block', block } : { kind: 'orphan' }
  }
  const length = anchor?.length ?? quote.length
  const matches = (index: number, offset: number): ShareCommentPlacement | null => {
    const found = rangesFrom(page, index, offset, length)
    const block = page.blocks[index]
    return found && block && found.text.startsWith(quote) && found.ranges.length > 0
      ? { kind: 'text', block, ranges: found.ranges }
      : null
  }
  if (anchor) {
    const index = page.blocks.findIndex((block) => blockLine(block) === anchor.line)
    const exact = index === -1 ? null : matches(index, anchor.offset)
    if (exact) {
      return exact
    }
  }
  const origin = anchor?.line ?? target.range.startLine
  const originOffset = anchor?.offset ?? 0
  const nearest = findQuote(page, quote)
    .map((candidate) => {
      const block = page.blocks[candidate.index]
      return { ...candidate, distance: block ? Math.abs(blockLine(block) - origin) : Infinity }
    })
    // Why the offset too: repeated text in one block ties on distance; keep the occurrence chosen.
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        Math.abs(left.offset - originOffset) - Math.abs(right.offset - originOffset)
    )
  for (const candidate of nearest) {
    const placed = matches(candidate.index, candidate.offset)
    if (placed) {
      return placed
    }
  }
  return { kind: 'orphan' }
}

function placeWholeBlock(
  page: ShareCommentPage,
  anchor: ArtifactShareCommentAnchor,
  quote: string | undefined
): ShareCommentPlacement {
  const sameText = (block: HTMLElement): boolean => {
    const text = page.map(block).text
    return quote ? text.startsWith(quote) : text.length === 0
  }
  const atLine = page.blocks.find((block) => blockLine(block) === anchor.line)
  if (atLine && sameText(atLine)) {
    return { kind: 'block', block: atLine }
  }
  const moved = page.blocks
    .filter(sameText)
    .sort(
      (left, right) =>
        Math.abs(blockLine(left) - anchor.line) - Math.abs(blockLine(right) - anchor.line)
    )[0]
  return moved && quote ? { kind: 'block', block: moved } : { kind: 'orphan' }
}
