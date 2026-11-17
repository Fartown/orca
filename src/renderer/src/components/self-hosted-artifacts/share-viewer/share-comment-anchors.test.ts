// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  captureShareCommentBlock,
  captureShareCommentSelection,
  placeShareComment,
  ShareCommentPage
} from './share-comment-anchors'

// The page's rendered blocks, as ShareCommentBlock and the markdown components emit them.
function block(start: number, end: number, inner: string): string {
  return `<div data-share-comment-block="" data-source-line="${start}" data-source-end-line="${end}">${inner}<button data-share-comment-chrome="">+</button></div>`
}

const PAGE = [
  block(3, 3, '<p>评论定位要准：第一个评论在这里，第二个评论在那里。</p>'),
  block(5, 7, '<p>第一行<br>\n第二行<br>\n第三行，选中这里</p>'),
  block(
    9,
    9,
    '<p>带 <strong>粗体</strong> 和 <span class="katex"><span class="katex-mathml">x^2</span><span class="katex-html">x2</span></span> 公式</p>'
  ),
  block(11, 11, '<p>跨段落的第一段，结尾在这里。</p>'),
  block(13, 13, '<p>跨段落的第二段，开头在这里。</p>'),
  block(
    15,
    18,
    '<table><tbody><tr data-source-line="15"><td>列一</td><td>列二</td></tr><tr data-source-line="17"><td>甲一</td><td>甲二</td></tr><tr data-source-line="18"><td>乙一</td><td>乙二</td></tr></tbody></table>'
  ),
  block(20, 24, '<pre><code>const one = 1\nconst two = 2\nconst three = 3\n</code></pre>'),
  `<ul><li>${block(26, 26, `父项自己的文字<ul><li>${block(27, 27, '子项一')}</li></ul>`)}</li></ul>`
].join('')

function mount(html = PAGE): { body: HTMLElement; page: () => ShareCommentPage } {
  const body = document.createElement('div')
  body.innerHTML = html
  document.body.replaceChildren(body)
  return { body, page: () => new ShareCommentPage(body) }
}

/** A DOM selection over the `occurrence`-th time `text` appears in a single text node. */
function select(body: HTMLElement, text: string, occurrence = 0, endText?: string): Range {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      node instanceof Text &&
      !node.parentElement?.closest('[data-share-comment-chrome], .katex-mathml')
    ) {
      nodes.push(node)
    }
  }
  const find = (needle: string, skip: number): { node: Text; at: number } => {
    let seen = 0
    for (const node of nodes) {
      for (let at = node.data.indexOf(needle); at !== -1; at = node.data.indexOf(needle, at + 1)) {
        if (seen++ === skip) {
          return { node, at }
        }
      }
    }
    throw new Error(`${needle} not on the page`)
  }
  const start = find(text, occurrence)
  const end = endText ? find(endText, 0) : { node: start.node, at: start.at }
  const range = document.createRange()
  range.setStart(start.node, start.at)
  range.setEnd(end.node, end.at + (endText ?? text).length)
  return range
}

function placedText(placement: ReturnType<typeof placeShareComment>): string[] {
  return placement.kind === 'text' ? placement.ranges.map((range) => range.toString()) : []
}

afterEach(() => document.body.replaceChildren())

/** The text before a placed range inside its node, to tell repeated words apart. */
function textBefore(placement: ReturnType<typeof placeShareComment>): string | null {
  const range = placement.kind === 'text' ? placement.ranges[0] : null
  return range ? (range.startContainer.textContent ?? '').slice(0, range.startOffset) : null
}

// These follow the app's review notes: a note is its blocks' line range plus its selected text,
// found first in the block holding its last line, then anywhere; else "Original text changed".
describe("share comments placed by the app's review-note rules", () => {
  it('records the line range of the blocks a selection touches and the text it shows', () => {
    const { body, page } = mount()
    expect(captureShareCommentSelection(page(), select(body, '选中这里'))).toEqual({
      range: { startLine: 5, endLine: 7 },
      quote: '选中这里'
    })
    expect(captureShareCommentSelection(page(), select(body, '乙二'))?.range).toEqual({
      startLine: 15,
      endLine: 18
    })
    // A formula contributes the text it shows, not its hidden TeX.
    expect(captureShareCommentSelection(page(), select(body, '粗体', 0, '公式'))?.quote).toBe(
      '粗体 和 x2 公式'
    )
    const across = captureShareCommentSelection(page(), select(body, '结尾在这里', 0, '开头在这里'))
    expect(across).toEqual({
      range: { startLine: 11, endLine: 13 },
      quote: '结尾在这里。 跨段落的第二段，开头在这里'
    })
    expect(placedText(placeShareComment(page(), across!))).toEqual([
      '结尾在这里。',
      '跨段落的第二段，开头在这里'
    ])
  })

  it('finds the selected text first in the block of its last line, as the app does', () => {
    const { body, page } = mount()
    const repeated = captureShareCommentSelection(page(), select(body, '评论', 2))!
    // The app matches the first occurrence in the block; the share page shows the same place.
    expect(textBefore(placeShareComment(page(), repeated))).toBe('')
    const second = captureShareCommentSelection(page(), select(body, '第二个评论'))!
    expect(textBefore(placeShareComment(page(), second))).toBe('评论定位要准：第一个评论在这里，')
  })

  it('lets a parent list item own its text and comments on whole blocks by their text', () => {
    const { body, page } = mount()
    expect(captureShareCommentSelection(page(), select(body, '父项自己的文字'))).toEqual({
      range: { startLine: 26, endLine: 26 },
      quote: '父项自己的文字'
    })
    const whole = captureShareCommentBlock(
      body.querySelector<HTMLElement>('[data-source-line="11"]')!
    )
    expect(whole).toEqual({
      range: { startLine: 11, endLine: 11 },
      quote: '跨段落的第一段，结尾在这里。',
      wholeBlock: true
    })
    expect(placedText(placeShareComment(page(), whole))).toEqual(['跨段落的第一段，结尾在这里。'])
  })

  it('finds moved text anywhere, and marks a note whose text is gone as unresolved', () => {
    const { body, page } = mount()
    const note = captureShareCommentSelection(page(), select(body, '乙二'))!

    // A paragraph inserted above: line 18 now holds other text, so the whole page is searched.
    const shifted = mount(
      block(3, 3, '<p>新增的一段。</p>') +
        PAGE.replaceAll(
          /data-source-line="(\d+)"/g,
          (_, line) => `data-source-line="${Number(line) + 4}"`
        )
    )
    expect(placedText(placeShareComment(shifted.page(), note))).toEqual(['乙二'])

    const removed = mount(PAGE.replace('乙二', '改过了'))
    expect(placeShareComment(removed.page(), note)).toEqual({
      kind: 'unresolved',
      block: removed.body.querySelector('[data-source-line="15"]')
    })
  })
})
