// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskAttentionItem } from '../../../../shared/local-tasks/local-task-link-types'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskProviderShortcut } from './LocalTaskProviderShortcut'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

function item(key: string): LocalTaskAttentionItem {
  return {
    key,
    taskId: 't1',
    taskSessionId: `s-${key}`,
    kind: 'approval',
    agent: 'claude',
    lastMessage: null,
    since: 0,
    replyable: false
  }
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint('local')
  const writer = domain.writer('local')
  writer.setConnection('live')
  writer.setHostState('ready', null)
  writer.applyProjects([project])
  writer.applyTasks([])
})
afterEach(cleanup)

it('carries the Needs you count, so a device without hover still sees it', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyProgress({ observedAt: 0, sessions: [], items: [item('a'), item('b')] })
  render(<LocalTaskProviderShortcut />)
  const shortcut = screen.getByRole('button', { name: /Open local tasks/ })
  expect(shortcut.getAttribute('aria-label')).toBe('Open local tasks · 2 sessions need you')
  expect(shortcut.textContent).toBe('2')
})
