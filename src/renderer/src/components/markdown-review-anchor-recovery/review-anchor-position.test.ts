// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { getRichMarkdownCommentBlocks } from '../editor/rich-markdown-comment-blocks'
import { measureRichMarkdownReviewNotePositions } from '../editor/rich-markdown-review-note-positioning'
import { resolveMarkdownReviewAnchorPosition } from './review-anchor-position'

const editors: Editor[] = []

function fixture(source = '# Heading\n\nFirst paragraph\n\nLast paragraph') {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: source,
    contentType: 'markdown'
  })
  editors.push(editor)
  editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
  const coordinates = vi.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos) => ({
    top: pos,
    bottom: pos + 20,
    left: 0,
    right: 10
  }))
  const comment: DiffComment = {
    id: 'original-note',
    worktreeId: 'owner-workspace',
    filePath: 'notes.md',
    source: 'markdown',
    lineNumber: 2,
    selectedText: 'Last paragraph',
    body: 'Keep this note',
    createdAt: 1,
    side: 'modified'
  }
  const resolve = (note: DiffComment, markdownSourceLineOffset = 0) =>
    resolveMarkdownReviewAnchorPosition({
      editor,
      comment: note,
      blocks: getRichMarkdownCommentBlocks(editor),
      containerRect: new DOMRect(0, 10, 600, 400),
      scrollTop: 30,
      markdownSourceLineOffset
    })
  return { editor, comment, coordinates, resolve }
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy()
  }
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('saved Markdown review anchors', () => {
  it.each([2, 999])('recovers moved text when saved line %s has no block', (lineNumber) => {
    const { editor, comment, coordinates, resolve } = fixture()
    const block = getRichMarkdownCommentBlocks(editor).find((entry) => entry.startLine === 5)!
    const note = { ...comment, lineNumber }
    const result = resolve(note)
    expect(result).toEqual({ comment: note, top: block.from + 20 })
    expect(result.comment).toBe(note)
    expect(coordinates).toHaveBeenCalledWith(block.from)
  })

  it('does not attach a removed quote to unrelated text at the old line', () => {
    const { comment, coordinates, resolve } = fixture()
    const note = { ...comment, lineNumber: 3, selectedText: 'Removed text' }
    expect(resolve(note)).toEqual({ comment: note, top: 0, anchorUnresolved: true })
    expect(coordinates).not.toHaveBeenCalled()
  })

  it.each([2, 999])('keeps unquoted notes accessible at invalid line %s', (lineNumber) => {
    const { comment, resolve } = fixture()
    const note = { ...comment, lineNumber, selectedText: undefined }
    expect(resolve(note)).toEqual({ comment: note, top: 0, anchorUnresolved: true })
  })

  it('retains ordinary line-only positioning and source line offsets', () => {
    const { editor, comment, resolve } = fixture()
    const block = getRichMarkdownCommentBlocks(editor).find((entry) => entry.startLine === 3)!
    const note = { ...comment, lineNumber: 103, selectedText: undefined }
    expect(resolve(note, 100)).toEqual({ comment: note, top: block.from + 20 })
    expect(resolve({ ...comment, lineNumber: 102 }, 100).anchorUnresolved).toBeUndefined()
  })

  it('keeps a note visible while source geometry cannot be measured', () => {
    const { comment, coordinates, resolve } = fixture()
    coordinates.mockImplementation(() => {
      throw new Error('Source geometry unavailable')
    })
    expect(resolve(comment)).toEqual({ comment, top: 0, anchorUnresolved: true })
  })

  it('preserves every note and stacks unresolved cards in an emptied document', () => {
    const { editor, comment } = fixture('')
    const notes = [comment, { ...comment, id: 'other-note', lineNumber: 999, body: 'Other body' }]
    const originalNotes = structuredClone(notes)
    const container = document.createElement('div')
    const positions = measureRichMarkdownReviewNotePositions({
      editor,
      container,
      markdownComments: notes,
      markdownSourceLineOffset: 0
    })
    expect(positions.map((position) => position.comment)).toEqual(notes)
    expect(positions.every((position) => position.anchorUnresolved)).toBe(true)
    expect(positions[1]!.top).toBeGreaterThan(positions[0]!.top)
    expect(notes).toEqual(originalNotes)
  })
})
