import { expect, it } from 'vitest'
import {
  claudeProjectSessionDir,
  describeGoalSessionHistory,
  GOAL_AGENT_PROVIDERS,
  goalSessionHistorySources,
  sessionHistoryFromTranscript
} from './goal-agent-provider'

it('keeps judge output flags unchanged and opts draft generation into structured events', () => {
  const options = { cwd: '/workspace', outFile: '/output.md' }
  expect(GOAL_AGENT_PROVIDERS.claude.args('prompt', options)).toContain('json')
  expect(GOAL_AGENT_PROVIDERS.claude.args('prompt', { ...options, streamEvents: true })).toEqual(
    expect.arrayContaining(['stream-json', '--verbose'])
  )
  expect(GOAL_AGENT_PROVIDERS.codex.args('prompt', options)).not.toContain('--json')
  expect(GOAL_AGENT_PROVIDERS.codex.args('prompt', { ...options, streamEvents: true })).toContain(
    '--json'
  )
})
it('reads only the final Claude result from a stream and preserves its Markdown', async () => {
  const document = '# 验收\n\n- [ ] 可核对的证据'
  const stdout = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'not the document' }] } },
    { type: 'result', is_error: false, result: document }
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  expect(await GOAL_AGENT_PROVIDERS.claude.read({ stdout, outFile: '' })).toBe(document)
  expect(
    await GOAL_AGENT_PROVIDERS.claude.read({
      stdout: JSON.stringify({ result: document }),
      outFile: ''
    })
  ).toBe(document)
})
it('never mistakes a Claude stream error for a generated acceptance document', async () => {
  const stdout =
    '{"type":"system","subtype":"init"}\n{"type":"result","is_error":true,"result":"not signed in"}\n'
  expect(await GOAL_AGENT_PROVIDERS.claude.read({ stdout, outFile: '' })).toBe(
    '验收裁判报错:not signed in'
  )
})
it('gives the guard full access on both CLIs: its limits live in the prompt', () => {
  const options = { cwd: '/workspace', outFile: '/verdict.md', sandbox: 'danger-full-access' }
  const claude = GOAL_AGENT_PROVIDERS.claude.args('prompt', options)
  expect(claude).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
  expect(claude).not.toContain('--disallowed-tools')
  expect(GOAL_AGENT_PROVIDERS.codex.args('prompt', options)).toEqual(
    expect.arrayContaining(['--sandbox', 'danger-full-access'])
  )
})
it('lists only the session sources that exist, and says so when none do', async () => {
  const exists = async (path: string) => path.includes('.claude')
  const sources = await goalSessionHistorySources(
    '/Users/me/dev/my.app',
    '/Users/me',
    undefined,
    exists
  )
  expect(sources).toEqual([
    {
      family: 'claude',
      path: '/Users/me/.claude/projects/-Users-me-dev-my-app',
      note: '本工作区的会话'
    }
  ])
  expect(describeGoalSessionHistory(sources)).toContain('-Users-me-dev-my-app（claude')
  expect(describeGoalSessionHistory([])).toBe('不可用')
  expect(claudeProjectSessionDir('/a_b/c', '/h')).toBe('/h/.claude/projects/-a-b-c')
})
it('reads the working agent session folder off its transcript path', () => {
  expect(
    sessionHistoryFromTranscript('/u/app/codex-home/sessions/2026/09/24/rollout-x.jsonl', 'codex')
  ).toMatchObject({ family: 'codex', path: '/u/app/codex-home/sessions' })
  expect(
    sessionHistoryFromTranscript('/u/.claude/projects/-u-app/abc.jsonl', 'claude')
  ).toMatchObject({ family: 'claude', path: '/u/.claude/projects/-u-app' })
  expect(sessionHistoryFromTranscript(null, 'codex')).toBeNull()
  expect(sessionHistoryFromTranscript('/u/x.jsonl', null)).toBeNull()
})
