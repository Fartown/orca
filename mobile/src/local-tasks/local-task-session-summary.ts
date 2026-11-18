import type { Nodes } from 'mdast'
import { parseMobileMarkdownTree, plainText } from '../components/mobile-markdown-tree'

const SUMMARY_MAX_CHARS = 160

function readableBlocks(node: Nodes): string {
  if (
    node.type === 'root' ||
    node.type === 'list' ||
    node.type === 'listItem' ||
    node.type === 'blockquote' ||
    node.type === 'table' ||
    node.type === 'tableRow'
  ) {
    return node.children.map(readableBlocks).join(' ')
  }
  return plainText(node)
}

/** One readable line for a session row; the full Markdown stays in its session. */
export function localTaskSessionSummary(markdown: string): string {
  const prose = readableBlocks(parseMobileMarkdownTree(markdown, false)).replace(/\s+/g, ' ').trim()
  const characters = Array.from(prose)
  return characters.length > SUMMARY_MAX_CHARS
    ? `${characters.slice(0, SUMMARY_MAX_CHARS).join('').trimEnd()}…`
    : prose
}
