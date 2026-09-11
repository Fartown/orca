import { expect, it } from 'vitest'
import { buildNotificationOptions } from '../ipc/notification-options'

it.each(['Provider task name', '继续'])(
  'identifies native %s in rich notifications without changing the reply',
  (sessionTitle) => {
    const result = buildNotificationOptions({
      source: 'agent-task-complete',
      sessionTitle,
      worktreeLabel: 'feature',
      agentType: 'codex',
      agentState: 'done',
      agentPrompt: 'Latest round',
      agentLastAssistantMessage: 'The patch is ready.'
    })
    expect(result.title).toBe(`${sessionTitle} · feature - Codex finished`)
    expect(result.body).toBe('The patch is ready.')
  }
)

it('preserves legacy formatting when an older producer omits the name', () => {
  expect(
    buildNotificationOptions({
      source: 'agent-task-complete',
      worktreeLabel: 'feature',
      agentType: 'codex',
      agentState: 'done'
    }).title
  ).toBe('feature - Codex finished')
})

it.each([
  ['blocked', false, 'needs input'],
  ['waiting', false, 'needs input'],
  ['done', true, 'stopped']
] as const)(
  'keeps the %s status and tool body separate from the session name',
  (agentState, agentInterrupted, status) => {
    expect(
      buildNotificationOptions({
        source: 'agent-task-complete',
        sessionTitle: 'Native name',
        agentType: 'claude',
        agentState,
        agentInterrupted,
        worktreeLabel: 'feature',
        agentToolName: 'Read',
        agentToolInput: 'src/main.ts'
      })
    ).toEqual({
      title: `Native name · feature - Claude ${status}`,
      body: 'Using Read: src/main.ts'
    })
  }
)

it('names bells and snapshot-free completions without changing their bodies', () => {
  expect(
    buildNotificationOptions({
      source: 'terminal-bell',
      sessionTitle: 'Native name',
      worktreeLabel: 'feature',
      repoLabel: 'repo'
    })
  ).toEqual({ title: 'Bell in Native name · feature', body: 'repo · Attention requested' })
  expect(
    buildNotificationOptions({
      source: 'agent-task-complete',
      sessionTitle: 'Native name',
      worktreeLabel: 'feature',
      terminalTitle: 'Codex ready'
    })
  ).toEqual({ title: 'Task complete in Native name · feature', body: 'Codex ready' })
})

it('normalizes and bounds the session snapshot without splitting unicode pairs', () => {
  const options = buildNotificationOptions({
    source: 'agent-task-complete',
    sessionTitle: `  ${'名'.repeat(78)}😀\nextra  `,
    worktreeLabel: 'feature'
  })
  expect(options.title).toBe(`Task complete in ${'名'.repeat(78)}… · feature`)
})
