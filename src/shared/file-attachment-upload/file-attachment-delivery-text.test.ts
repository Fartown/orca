import { describe, expect, it } from 'vitest'
import {
  appendFileAttachmentReferenceToDraft,
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

describe('appendFileAttachmentReferenceToDraft', () => {
  it('keeps one space on each side of the reference', () => {
    expect(appendFileAttachmentReferenceToDraft('', '/tmp/a.pdf')).toBe('@/tmp/a.pdf ')
    expect(appendFileAttachmentReferenceToDraft('read', '/tmp/a.pdf')).toBe('read @/tmp/a.pdf ')
    expect(appendFileAttachmentReferenceToDraft('read ', '/tmp/a.pdf')).toBe('read @/tmp/a.pdf ')
  })

  it('quotes a path with spaces', () => {
    expect(appendFileAttachmentReferenceToDraft('', '/tmp/a b.pdf')).toBe('@"/tmp/a b.pdf" ')
  })
})
