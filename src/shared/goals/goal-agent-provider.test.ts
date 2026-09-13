import { expect, it } from 'vitest'
import { GOAL_AGENT_PROVIDERS } from './goal-agent-provider'

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
