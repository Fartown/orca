import { describe, expect, it } from 'vitest'
import { DaemonStreamPosition } from './daemon-stream-position'

describe('daemon delivered stream position', () => {
  it('anchors early legacy data after a fresh stream snapshot cut', () => {
    const cursor = new DaemonStreamPosition()
    const begin = cursor.beginAttach('pty')
    cursor.record('pty', 7)
    cursor.attach('pty', 900, false, begin, 'owner')
    expect(cursor.position('pty')).toBe(907)
    cursor.record('pty', 4)
    expect(cursor.position('pty')).toBe(911)
  })

  it('does not count an existing stream snapshot as delivered queued bytes', () => {
    const cursor = new DaemonStreamPosition()
    cursor.attach('pty', 0, true, cursor.beginAttach('pty'), 'owner')
    cursor.record('pty', 6)
    cursor.attach('pty', 900, false, cursor.beginAttach('pty'), 'owner')
    expect(cursor.position('pty')).toBe(6)
    cursor.record('pty', 894)
    expect(cursor.position('pty')).toBe(900)
  })

  it('rebases a replacement stream and retains raw lengths and gap positions', () => {
    const cursor = new DaemonStreamPosition()
    cursor.attach('pty', 0, true, cursor.beginAttach('pty'), 'owner')
    cursor.record('pty', 6)
    cursor.disconnected()
    const begin = cursor.beginAttach('pty')
    cursor.record('pty', 40)
    cursor.record('pty', 3)
    cursor.attach('pty', 900, false, begin, 'owner')
    expect(cursor.position('pty')).toBe(943)
  })

  it('uses an explicit owner span endpoint without adding early data twice', () => {
    const cursor = new DaemonStreamPosition()
    const begin = cursor.beginAttach('pty')
    cursor.record('pty', 40, 940)
    cursor.record('pty', 7)
    cursor.attach('pty', 900, false, begin, 'owner')
    expect(cursor.position('pty')).toBe(947)
  })

  it('isolates sessions and an observed exit from its successor', () => {
    const cursor = new DaemonStreamPosition()
    cursor.attach('a', 0, true, cursor.beginAttach('a'), 'old')
    cursor.record('a', 90)
    const begin = cursor.beginAttach('a')
    cursor.forget('a')
    cursor.record('a', 7)
    cursor.attach('a', 0, true, begin, 'new')
    cursor.attach('b', 40, false, cursor.beginAttach('b'), 'other')
    expect(cursor.position('a')).toBe(7)
    expect(cursor.position('b')).toBe(40)
  })

  it('does not invent an absolute domain for a provider without a snapshot position', () => {
    const cursor = new DaemonStreamPosition()
    const begin = cursor.beginAttach('pty')
    cursor.record('pty', 9)
    cursor.attach('pty', undefined, false, begin)
    expect(cursor.position('pty')).toBeUndefined()
  })
})
