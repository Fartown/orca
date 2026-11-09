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

describe('share comment anchors', () => {
  it('records the chosen occurrence and finds that one again, not the first', () => {
    const { body, page } = mount()
    const draft = captureShareCommentSelection(page(), select(body, '评论', 2))
    expect(draft).toMatchObject({
      range: { startLine: 3, endLine: 3 },
      quote: '评论',
      anchor: { line: 3, length: 2 }
    })
    const placed = placeShareComment(page(), draft!)
    expect(placed.kind).toBe('text')
    const range = placed.kind === 'text' ? placed.ranges[0] : null
    // The chosen 评论 follows 第二个; the first one on the line opens it.
    expect(range?.startContainer.textContent?.slice(0, range.startOffset)).toMatch(/第二个$/)
  })

  it('names the exact source line in multi-line paragraphs, tables and code', () => {
    const { body, page } = mount()
    expect(captureShareCommentSelection(page(), select(body, '选中这里'))?.range).toEqual({
      startLine: 7,
      endLine: 7
    })
    expect(captureShareCommentSelection(page(), select(body, '乙二'))?.range).toEqual({
      startLine: 18,
      endLine: 18
    })
    expect(captureShareCommentSelection(page(), select(body, 'three'))?.range).toEqual({
      startLine: 23,
      endLine: 23
    })
  })

  it('keeps a formula to its visible text and spans a selection across paragraphs', () => {
    const { body, page } = mount()
    const formula = captureShareCommentSelection(page(), select(body, '粗体', 0, '公式'))
    expect(formula?.quote).toBe('粗体 和 x2 公式')

    const across = captureShareCommentSelection(page(), select(body, '结尾在这里', 0, '开头在这里'))
    expect(across).toMatchObject({ range: { startLine: 11, endLine: 13 } })
    expect(placedText(placeShareComment(page(), across!))).toEqual([
      '结尾在这里。',
      '跨段落的第二段，开头在这里'
    ])
  })

  it('lets a parent list item own its text without its sub-list', () => {
    const { body, page } = mount()
    const parent = captureShareCommentSelection(page(), select(body, '父项自己的文字'))
    expect(parent).toMatchObject({ range: { startLine: 26, endLine: 26 }, anchor: { line: 26 } })
    const parentBlock = body.querySelector<HTMLElement>('[data-source-line="26"]')!
    expect(captureShareCommentBlock(parentBlock).quote).toBe('父项自己的文字')
  })

  it('follows text that moved, and gives up on text that is gone', () => {
    const { body, page } = mount()
    const draft = captureShareCommentSelection(page(), select(body, '评论', 2))!
    const whole = captureShareCommentBlock(
      body.querySelector<HTMLElement>('[data-source-line="11"]')!
    )

    // A paragraph inserted above: every line moves down by four.
    const shifted = mount(
      block(3, 3, '<p>新增的一段。</p>') +
        PAGE.replaceAll(
          /data-source-line="(\d+)"/g,
          (_, line) => `data-source-line="${Number(line) + 4}"`
        )
    )
    const moved = placeShareComment(shifted.page(), draft)
    const range = moved.kind === 'text' ? moved.ranges[0] : null
    expect(range?.startContainer.textContent?.slice(0, range.startOffset)).toMatch(/第二个$/)
    expect(placeShareComment(shifted.page(), whole)).toMatchObject({ kind: 'block' })

    const rewritten = mount(PAGE.replace('第二个评论', '第二处'))
    const quoted = { ...draft, quote: '第二个评论', anchor: { ...draft.anchor!, length: 5 } }
    expect(placeShareComment(rewritten.page(), quoted)).toEqual({ kind: 'orphan' })
    const removed = mount(PAGE.replace('跨段落的第一段，结尾在这里。', '改写过的段落。'))
    expect(placeShareComment(removed.page(), whole)).toEqual({ kind: 'orphan' })
  })
})
