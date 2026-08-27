import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { AgentStatusState } from '../../../shared/agent-status-types'
import type { ConversationSummary } from '../../../shared/issues/types'

/**
 * 把一条没有活 pane 的 Conversation 合成 DashboardAgentRow,交给既有组件渲染。
 *
 * 不自己画行:DashboardAgentRow 带着状态点、模型、工具名、耗时、发送目标、右键菜单和 lineage,
 * 手写一份必然是它的残缺子集。合成出来缺的那些字段(model / toolName / lastAssistantMessage 等)
 * 全是可空展示字段,组件本身会降级 —— 见 DashboardAgentRow.tsx:149 的兜底。
 */

/** 合成键只用于 React key 与 lineage 映射,绝不能被当成真 paneKey 解析。 */
export const PERSISTED_ROW_PANE_KEY_PREFIX = 'persisted-conversation:'

export function isPersistedRowPaneKey(paneKey: string): boolean {
  return paneKey.startsWith(PERSISTED_ROW_PANE_KEY_PREFIX)
}

function agentStateForConversation(conversation: ConversationSummary): AgentStatusState | 'idle' {
  switch (conversation.executionState) {
    case 'waiting':
      return 'waiting'
    case 'failed':
      return 'blocked'
    default:
      // Why: 没有活 pane 就没有正在进行的工作,launching / running 都已经是过去式。
      return 'idle'
  }
}

export function buildPersistedConversationRow(args: {
  conversation: ConversationSummary
  worktreeId: string
  /** 取不到用户命名与 tab 名时的兜底,通常来自 aiVault 的会话标题。 */
  fallbackTitle?: string | null
}): DashboardAgentRow {
  const { conversation, worktreeId } = args
  const paneKey = `${PERSISTED_ROW_PANE_KEY_PREFIX}${conversation.id}`
  const title = conversation.title?.trim() || args.fallbackTitle?.trim() || ''
  return {
    paneKey,
    // Why: tab 只被 DashboardAgentRow 用来读 id,但 useAgentRowConversationName 会拿它当快照 ——
    // 这正是 `liveTab ?? agent.tab` 那条既有兜底路径的用法。
    tab: {
      id: paneKey,
      worktreeId,
      title,
      customTitle: null,
      generatedTitle: null,
      defaultTitle: conversation.agent
    } as DashboardAgentRow['tab'],
    entry: {
      state: 'done',
      prompt: title,
      updatedAt: conversation.updatedAt,
      stateStartedAt: conversation.updatedAt,
      paneKey
    } as DashboardAgentRow['entry'],
    agentType: conversation.agent as DashboardAgentRow['agentType'],
    state: agentStateForConversation(conversation),
    startedAt: conversation.createdAt,
    rowSource: 'retained'
  }
}
