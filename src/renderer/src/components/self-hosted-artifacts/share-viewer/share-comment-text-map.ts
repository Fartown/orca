import {
  SHARE_COMMENT_BLOCK_SELECTOR,
  SHARE_COMMENT_CHROME_ATTRIBUTE
} from './share-comment-blocks'

type TextPoint = { node: Text; offset: number }

/**
 * A block's visible text with whitespace collapsed, and where each character sits in the DOM.
 * Separator spaces between cells, items and lines have no DOM point.
 */
export type ShareCommentTextMap = { text: string; points: (TextPoint | null)[] }

// Elements whose edges separate words even when the markup has no space between them.
const SEPARATED_TAGS = new Set([
  'BR',
  'TD',
  'TH',
  'TR',
  'LI',
  'P',
  'DIV',
  'PRE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'SUMMARY',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'TABLE'
])

/** Comment chrome, nested blocks (they map their own text) and KaTeX's hidden MathML copy. */
function isExcluded(element: Element, block: HTMLElement): boolean {
  return (
    element.hasAttribute(SHARE_COMMENT_CHROME_ATTRIBUTE) ||
    element.classList.contains('katex-mathml') ||
    element.tagName === 'BUTTON' ||
    element.tagName === 'svg' ||
    (element !== block && element.matches(SHARE_COMMENT_BLOCK_SELECTOR))
  )
}

// Same collapsing as the app's rich editor uses to find a review note's selected text.
function isWhitespace(char: string): boolean {
  return /\s/.test(char)
}

export function buildShareCommentTextMap(block: HTMLElement): ShareCommentTextMap {
  let text = ''
  const points: (TextPoint | null)[] = []
  let pendingSpace = false
  const space = (): void => {
    pendingSpace = text.length > 0
  }
  const visit = (parent: Node): void => {
    for (const child of parent.childNodes) {
      if (child instanceof Text) {
        const value = child.data
        for (let index = 0; index < value.length; index += 1) {
          const char = value.charAt(index)
          if (isWhitespace(char)) {
            space()
            continue
          }
          if (pendingSpace) {
            text += ' '
            points.push(null)
            pendingSpace = false
          }
          text += char
          points.push({ node: child, offset: index })
        }
      } else if (child instanceof Element && !isExcluded(child, block)) {
        const separated = SEPARATED_TAGS.has(child.tagName)
        if (separated) {
          space()
        }
        visit(child)
        if (separated) {
          space()
        }
      }
    }
  }
  visit(block)
  return { text, points }
}

function compareToPoint(container: Node, offset: number, point: TextPoint): number {
  const range = document.createRange()
  range.setStart(container, offset)
  return range.comparePoint(point.node, point.offset)
}

/** Index of the first character at or after a DOM position: where a selection starting there begins. */
export function shareCommentTextStart(
  map: ShareCommentTextMap,
  container: Node,
  offset: number
): number {
  const index = map.points.findIndex(
    (point) => point !== null && compareToPoint(container, offset, point) >= 0
  )
  return index === -1 ? map.text.length : index
}

/** One past the last character before a DOM position: where a selection ending there ends. */
export function shareCommentTextEnd(
  map: ShareCommentTextMap,
  container: Node,
  offset: number
): number {
  for (let index = map.points.length - 1; index >= 0; index -= 1) {
    const point = map.points[index]
    if (point && compareToPoint(container, offset, point) < 0) {
      return index + 1
    }
  }
  return 0
}

/** The DOM range covering characters [start, end); null when they are only separators. */
export function shareCommentTextRange(
  map: ShareCommentTextMap,
  start: number,
  end: number
): Range | null {
  let first: TextPoint | null = null
  let last: TextPoint | null = null
  for (let index = start; index < end; index += 1) {
    const point = map.points[index]
    if (point) {
      first ??= point
      last = point
    }
  }
  if (!first || !last) {
    return null
  }
  const range = document.createRange()
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

/** The DOM position of character `index`, for working out which source line it is on. */
export function shareCommentTextPoint(map: ShareCommentTextMap, index: number): TextPoint | null {
  for (let at = index; at >= 0; at -= 1) {
    const point = map.points[at]
    if (point) {
      return point
    }
  }
  return null
}
