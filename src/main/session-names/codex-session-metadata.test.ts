import { describe, expect, it } from 'vitest'
import { parseCodexSessionContent } from '../ai-vault/session-scanner-codex-parser'
import { extractCodexSessionMetadataTitle } from './codex-session-metadata'

const workerCases: [string, Record<string, unknown>, boolean][] = [
  ['no source', {}, false],
  ['snake case user', { thread_source: 'user' }, false],
  ['camel case user', { threadSource: 'user' }, false],
  ['normalized user', { thread_source: ' USER ' }, false],
  ['snake case worker', { thread_source: 'subagent' }, true],
  ['camel case worker', { threadSource: 'memory' }, true],
  ['legacy worker', { source: { subagent: { thread_spawn: {} } } }, true],
  ['empty legacy worker', { source: { subagent: {} } }, true],
  ['invalid legacy worker', { source: { subagent: 'worker' } }, false],
  ['user outranks legacy worker', { thread_source: 'user', source: { subagent: {} } }, false],
  ['snake case wins', { thread_source: 'user', threadSource: 'subagent' }, false],
  ['empty snake case falls through', { thread_source: ' ', threadSource: 'subagent' }, true],
  ['invalid snake case falls through', { thread_source: 1, threadSource: 'user' }, false]
]

describe('Codex metadata behavior preserved by upstream worker reuse', () => {
  it.each(workerCases)('%s', async (_name, source, worker) => {
    const session = await parseCodexSessionContent({
      file: { path: '/fixture/session.jsonl', mtimeMs: 1, modifiedAt: '2026-09-11T00:00:00Z' },
      content: [
        { type: 'session_meta', payload: { id: 'session', title: 'Native name', ...source } },
        { type: 'event_msg', payload: { type: 'user_message', message: 'Check login behavior' } }
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
      platform: 'linux',
      executionHostId: 'ssh:fixture',
      readIndexedTitle: async () => null
    })
    if (worker) {
      expect(session).toBeNull()
    } else {
      expect(session).toMatchObject({
        sessionId: 'session',
        providerName: { kind: 'named', title: 'Native name', field: 'session_meta.title' },
        generatedTitle: 'Check login behavior'
      })
    }
  })

  it.each(['title', 'thread_name', 'threadName'])('preserves precise %s evidence', (field) => {
    expect(extractCodexSessionMetadataTitle({ [field]: ' Native name ' })).toEqual({
      title: 'Native name',
      field: `session_meta.${field}`
    })
  })

  it('retains title precedence and skips empty candidates', () => {
    expect(extractCodexSessionMetadataTitle({ title: 'First', thread_name: 'Second' })).toEqual({
      title: 'First',
      field: 'session_meta.title'
    })
    expect(extractCodexSessionMetadataTitle({ title: ' ', thread_name: 'Second' })).toEqual({
      title: 'Second',
      field: 'session_meta.thread_name'
    })
    expect(extractCodexSessionMetadataTitle({ title: 1, threadName: 'Third' })).toEqual({
      title: 'Third',
      field: 'session_meta.threadName'
    })
    expect(extractCodexSessionMetadataTitle({ title: ' ' })).toBeNull()
  })
})
