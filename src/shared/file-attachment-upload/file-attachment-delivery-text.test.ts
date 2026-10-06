import { describe, expect, it } from 'vitest'
import {
  appendFileAttachmentPathToDraft,
  fileAttachmentTerminalInput,
  isAgentImageAttachmentName
} from './file-attachment-delivery-text'

describe('fileAttachmentTerminalInput', () => {
  it('types the path followed by one space', () => {
    expect(fileAttachmentTerminalInput('/tmp/a b.zip')).toBe("'/tmp/a b.zip' ")
  })
})

describe('isAgentImageAttachmentName', () => {
  it('accepts only the types structured Claude reads as images', () => {
    expect(isAgentImageAttachmentName('a.PNG')).toBe(true)
    expect(isAgentImageAttachmentName('a.jpeg')).toBe(true)
    expect(isAgentImageAttachmentName('a.heic')).toBe(false)
    expect(isAgentImageAttachmentName('a.svg')).toBe(false)
    expect(isAgentImageAttachmentName('.png')).toBe(false)
  })
})

describe('appendFileAttachmentPathToDraft', () => {
  it('quotes the path so it opens neither an @ nor a slash-command menu', () => {
    expect(appendFileAttachmentPathToDraft('', '/tmp/a.pdf')).toBe('"/tmp/a.pdf" ')
    expect(appendFileAttachmentPathToDraft('read', '/tmp/a.pdf')).toBe('read "/tmp/a.pdf" ')
    expect(appendFileAttachmentPathToDraft('read ', '/tmp/a b.pdf')).toBe('read "/tmp/a b.pdf" ')
  })

  it('falls back to single quotes for a path that holds a double quote', () => {
    expect(appendFileAttachmentPathToDraft('', '/tmp/say "hi".txt')).toBe(`'/tmp/say "hi".txt' `)
  })
})
