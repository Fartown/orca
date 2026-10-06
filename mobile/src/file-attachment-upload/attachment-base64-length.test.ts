import { describe, expect, it } from 'vitest'
import { base64DecodedByteLength } from './attachment-base64-length'

describe('base64DecodedByteLength', () => {
  it('counts padded and unpadded tails alike', () => {
    for (let size = 0; size <= 7; size += 1) {
      const padded = Buffer.alloc(size, 7).toString('base64')
      expect(base64DecodedByteLength(padded)).toBe(size)
      expect(base64DecodedByteLength(padded.replace(/=+$/, ''))).toBe(size)
    }
  })
})
