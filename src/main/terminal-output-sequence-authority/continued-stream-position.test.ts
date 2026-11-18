import { expect, it } from 'vitest'
import { continuedStreamPosition } from './continued-stream-position'

it('advances missing data from the delivered position rather than the snapshot upper bound', () => {
  expect(continuedStreamPosition(907, 13, 0)).toEqual({ position: 907, offset: 0 })
  expect(continuedStreamPosition(6, 6, 0)).toEqual({ position: 6, offset: 0 })
})
it('preserves the runtime generation offset and monotonic watermark', () => {
  expect(continuedStreamPosition(6, 1006, 1000)).toEqual({ position: 1006, offset: 1000 })
  expect(continuedStreamPosition(6, 1010, 1000)).toEqual({ position: 1010, offset: 1004 })
})
it('keeps legacy and malformed provider metadata on the existing path', () => {
  for (const value of [undefined, -1, 1.2, Number.NaN, Infinity]) {
    expect(continuedStreamPosition(value, 6, 0)).toBeNull()
  }
})
