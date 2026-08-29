import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_TREE_INDENT,
  WORKTREE_SECTION_HEADER_PADDING_LEFT
} from '../worktree-list/rows/indentation'
import { getIssueRowContentIndent } from './issue-virtual-row'

describe('Issue row indentation', () => {
  it('uses the visible Issue root as its baseline without an invisible Project group step', () => {
    expect(getIssueRowContentIndent(0)).toBe(WORKTREE_SECTION_HEADER_PADDING_LEFT)
    expect(getIssueRowContentIndent(1)).toBe(
      WORKTREE_SECTION_HEADER_PADDING_LEFT + SIDEBAR_TREE_INDENT
    )
  })
})
