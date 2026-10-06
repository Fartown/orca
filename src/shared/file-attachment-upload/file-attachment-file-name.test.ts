import { describe, expect, it } from 'vitest'
import {
  fileAttachmentExtensionForMime,
  sanitizeFileAttachmentName
} from './file-attachment-file-name'

describe('sanitizeFileAttachmentName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(sanitizeFileAttachmentName('report.pdf', 'application/pdf')).toBe('report.pdf')
    expect(sanitizeFileAttachmentName('季度 报告 (final).docx')).toBe('季度 报告 (final).docx')
    expect(sanitizeFileAttachmentName('.env')).toBe('.env')
  })

  it('keeps only the last path segment', () => {
    expect(sanitizeFileAttachmentName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFileAttachmentName('C:\\Users\\me\\notes.txt')).toBe('notes.txt')
  })

  it('replaces characters a Windows host cannot store', () => {
    expect(sanitizeFileAttachmentName('a:b*c?d"e<f>g|h.txt')).toBe('a_b_c_d_e_f_g_h.txt')
    expect(sanitizeFileAttachmentName('line\nbreak.txt')).toBe('line_break.txt')
  })

  it('drops trailing dots and spaces and prefixes reserved device names', () => {
    expect(sanitizeFileAttachmentName('notes.txt. . ')).toBe('notes.txt')
    expect(sanitizeFileAttachmentName('CON.txt')).toBe('_CON.txt')
    expect(sanitizeFileAttachmentName('nul')).toBe('_nul')
    expect(sanitizeFileAttachmentName('nul.tar.gz')).toBe('_nul.tar.gz')
    expect(sanitizeFileAttachmentName('aux.min.js')).toBe('_aux.min.js')
    expect(sanitizeFileAttachmentName('CONOUT$.log')).toBe('_CONOUT$.log')
    expect(sanitizeFileAttachmentName('console.log')).toBe('console.log')
  })

  it('falls back to a typed name when nothing usable is left', () => {
    expect(sanitizeFileAttachmentName('', 'application/pdf')).toBe('attachment.pdf')
    expect(sanitizeFileAttachmentName('...', undefined)).toBe('attachment.bin')
    expect(sanitizeFileAttachmentName('  ', 'application/zip')).toBe('attachment.zip')
  })

  it('adds the type extension to a name that has none', () => {
    expect(sanitizeFileAttachmentName('scan', 'application/pdf')).toBe('scan.pdf')
    expect(sanitizeFileAttachmentName('scan', 'application/octet-stream')).toBe('scan')
  })

  it('bounds the name in UTF-8 bytes and keeps the extension', () => {
    const name = sanitizeFileAttachmentName(`${'文'.repeat(80)}.pdf`)
    expect(name.endsWith('.pdf')).toBe(true)
    expect(new TextEncoder().encode(name).byteLength).toBeLessThanOrEqual(120)
  })
})

describe('fileAttachmentExtensionForMime', () => {
  it('reads the essence and ignores parameters and case', () => {
    expect(fileAttachmentExtensionForMime('Text/Plain; charset=utf-8')).toBe('.txt')
    expect(fileAttachmentExtensionForMime('application/x-unknown')).toBeNull()
    expect(fileAttachmentExtensionForMime(undefined)).toBeNull()
  })
})
