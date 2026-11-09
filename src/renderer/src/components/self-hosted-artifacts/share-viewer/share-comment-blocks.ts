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
