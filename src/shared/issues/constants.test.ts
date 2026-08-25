import { describe, expect, it } from 'vitest'
import {
  AuthorityExecutionHostIdSchema,
  IssueRouteExecutionHostIdSchema
} from './authority-schemas'
import {
  ISSUE_MAX_DEPTH,
  ISSUE_STATES,
  ORCA_ISSUES_RUNTIME_CAPABILITY,
  ROUND_RECORD_KINDS,
  ROUND_RECORD_STATE_SOURCES,
  ROUND_TEXT_COMPLETENESS
} from './constants'
import { ConversationRecordSchema, IssueRecordSchema, RoundRecordSchema } from './record-schemas'
import { RUNTIME_CAPABILITIES } from '../protocol-version'

describe('Issue shared v1 contracts', () => {
  it('contains only the core-first-version states', () => {
    expect(ISSUE_STATES).toEqual(['active', 'archived'])
    expect(ROUND_RECORD_KINDS).toEqual(['completion', 'waiting'])
    expect(ROUND_RECORD_STATE_SOURCES).toEqual(['hook', 'reconciled'])
    expect(ROUND_TEXT_COMPLETENESS).toEqual([
      'not-captured',
      'runtime-preview',
      'reconciled-preview'
    ])
    expect(ISSUE_MAX_DEPTH).toBe(3)
    expect(ORCA_ISSUES_RUNTIME_CAPABILITY).toBe('orca-issues.v1')
    expect(RUNTIME_CAPABILITIES).toContain(ORCA_ISSUES_RUNTIME_CAPABILITY)
  })

  it('separates authority execution hosts from client routes', () => {
    expect(AuthorityExecutionHostIdSchema.parse('local')).toBe('local')
    expect(AuthorityExecutionHostIdSchema.parse('ssh:build-box')).toBe('ssh:build-box')
    expect(() => AuthorityExecutionHostIdSchema.parse('runtime:paired')).toThrow()
    expect(IssueRouteExecutionHostIdSchema.parse('runtime:paired')).toBe('runtime:paired')
  })

  it('does not expose deferred fields in v1 record schemas', () => {
    const issueKeys = Object.keys(IssueRecordSchema.shape)
    const conversationKeys = Object.keys(ConversationRecordSchema.shape)
    const roundKeys = Object.keys(RoundRecordSchema.shape)
    expect(issueKeys).toContain('state')
    expect(conversationKeys).not.toContain('state')
    expect([...issueKeys, ...conversationKeys, ...roundKeys]).not.toEqual(
      expect.arrayContaining(['executionChainId', 'supersedesRoundId', 'digest', 'bodyRevision'])
    )
  })
})
