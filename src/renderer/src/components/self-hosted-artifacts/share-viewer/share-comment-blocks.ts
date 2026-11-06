import type { ShareCommentRange } from './share-viewer-comments-state'

export const SHARE_COMMENT_BLOCK_ATTRIBUTE = 'data-share-comment-block'
export const SHARE_COMMENT_ID_ATTRIBUTE = 'data-share-comment-id'
/** Comment buttons and inline cards inside a block; never part of the text a comment quotes. */
export const SHARE_COMMENT_CHROME_ATTRIBUTE = 'data-share-comment-chrome'
export const SHARE_COMMENT_BLOCK_SELECTOR = `[${SHARE_COMMENT_BLOCK_ATTRIBUTE}]`

export function readShareCommentBlockRange(block: HTMLElement): ShareCommentRange {
  return {
    startLine: Number(block.dataset.sourceLine),
    endLine: Number(block.dataset.sourceEndLine)
  }
}

/** Rendered blocks whose source lines overlap the range, in document order. */
export function findShareCommentBlocks(root: ParentNode, range: ShareCommentRange): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SHARE_COMMENT_BLOCK_SELECTOR)].filter((block) => {
    const lines = readShareCommentBlockRange(block)
    return lines.startLine <= range.endLine && lines.endLine >= range.startLine
  })
}

/** Like the app's preview, a comment belongs to the block holding its last line; else it is orphaned. */
export function findShareCommentHomeBlock(
  root: ParentNode,
  comment: Pick<ShareCommentRange, 'endLine'>
): HTMLElement | null {
  return (
    [...root.querySelectorAll<HTMLElement>(SHARE_COMMENT_BLOCK_SELECTOR)].find((block) => {
      const lines = readShareCommentBlockRange(block)
      return lines.startLine <= comment.endLine && comment.endLine <= lines.endLine
    }) ?? null
  )
}
