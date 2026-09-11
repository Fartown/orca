import { expect, it } from 'vitest'
import { projectActivityTabs } from '../components/activity/activity-tab-projection'
import { buildActivityTabContext } from '../components/activity/activity-event-builder-context'
import { getActivitySessionName } from './activity-session-name'
import type { Tab } from '../../../shared/tab-types'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'

const tab: Tab = {
  id: 'agent-tab',
  entityId: 'agent-session',
  groupId: 'group',
  worktreeId: 'folder:docs',
  contentType: 'agent-session',
  label: 'Codex',
  customLabel: '容器别名',
  generatedLabel: '首个任务',
  color: null,
  sortOrder: 0,
  createdAt: 1,
  executionHostId: 'local',
  aiVaultTitle: {
    agent: 'codex',
    sessionId: 'A',
    title: '旧混合标题',
    providerName: { kind: 'named', title: '原生名', field: 'session_index.thread_name' }
  }
}
const entry: AgentStatusEntry = {
  paneKey: 'agent-tab:11111111-1111-4111-8111-111111111111',
  agentType: 'codex',
  state: 'working',
  prompt: '继续',
  updatedAt: 1,
  stateStartedAt: 1,
  stateHistory: [],
  providerSession: { key: 'session_id', id: 'A' }
}

it('agent-session projection preserves native, generated and container candidates separately', () => {
  const projected = projectActivityTabs({ folder: [tab] }, null)
  const context = buildActivityTabContext({}, projected).get(tab.id)!
  expect(context.tab).toMatchObject({
    title: 'Codex',
    generatedTitle: '首个任务',
    customTitle: '容器别名',
    aiVaultTitle: tab.aiVaultTitle
  })
  expect(getActivitySessionName(entry, context.tab, true)).toBe('原生名')
  expect(
    getActivitySessionName(
      { ...entry, providerSession: { key: 'session_id', id: 'B' } },
      context.tab,
      true
    )
  ).not.toBe('原生名')
})

it('an evidence-only rename invalidates projection while a focus-only update retains it', () => {
  const previous = projectActivityTabs({ folder: [tab] }, null)
  const focusOnly = projectActivityTabs({ folder: [{ ...tab, lastFocusedAt: 100 }] }, previous)
  expect(focusOnly).toBe(previous)
  const rename = projectActivityTabs(
    {
      folder: [
        {
          ...tab,
          aiVaultTitle: {
            ...tab.aiVaultTitle!,
            providerName: { kind: 'named', title: '新的原生名', field: 'session_index.thread_name' }
          }
        }
      ]
    },
    previous
  )
  expect(rename).not.toBe(previous)
  expect(
    getActivitySessionName(entry, buildActivityTabContext({}, rename).get(tab.id)!.tab, true)
  ).toBe('新的原生名')
})

it('only owned history seeds a stable prompt; newer or another session prompts cannot replace it', () => {
  const context = buildActivityTabContext({}, { folder: [tab] }).get(tab.id)!
  const history = [
    {
      state: 'done' as const,
      prompt: '错误会话的提示词',
      startedAt: 1,
      sessionName: { agentType: 'codex', providerSession: { key: 'session_id' as const, id: 'B' } }
    },
    {
      state: 'done' as const,
      prompt: '会话A的最初任务',
      startedAt: 2,
      sessionName: { agentType: 'codex', providerSession: { key: 'session_id' as const, id: 'A' } }
    }
  ]
  expect(
    getActivitySessionName(
      { ...entry, stateStartedAt: 3, stateHistory: history, prompt: '后续详细任务' },
      { ...context.tab, aiVaultTitle: null },
      true
    )
  ).toBe('会话A的最初任务')
})

it('disabling renderer generation leaves scanner prompt evidence intact but never derives from a hook prompt', () => {
  const terminal = buildActivityTabContext({}, { folder: [tab] }).get(tab.id)!.tab
  expect(
    getActivitySessionName(
      { ...entry, prompt: '只能由renderer派生的任务' },
      { ...terminal, aiVaultTitle: null },
      false
    )
  ).not.toContain('只能由renderer')
  expect(
    getActivitySessionName(
      entry,
      {
        ...terminal,
        aiVaultTitle: {
          agent: 'codex',
          sessionId: 'A',
          title: '文件中的首个任务',
          providerName: { kind: 'absent' },
          generatedTitle: '文件中的首个任务'
        }
      },
      false
    )
  ).toBe('文件中的首个任务')
})
