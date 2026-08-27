import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { WorkspaceScope } from '../../../shared/folder-workspace-types'
import type { IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { IssueRuntimeClient } from './issue-runtime-client'

/**
 * 把一次「恢复会话」记进 Issues。
 *
 * Resume 早于 Issues 存在,本身不依赖任何数据库,所以这里**永不抛出**:主机不支持、Issue 库打不开、
 * 迁移失败、路由离线,都只是记不上账,不能成为用户恢复不了工作的理由。契约由本函数自己保证,
 * 而不是靠每个调用点记得包 try —— 那种写法上一版就漏成了「只兜 Unsupported 一种错」。
 */
export async function recordResumedConversation(args: {
  executionHostId: IssueRouteExecutionHostId | null
  launchToken: string
  workspaceRef: WorkspaceScope
  workspaceSnapshot: { name: string; path: string | null }
  agent: string
  providerSession: AgentProviderSessionMetadata
}): Promise<{ recorded: boolean }> {
  if (!args.executionHostId || !args.workspaceSnapshot.path) {
    return { recorded: false }
  }
  try {
    await IssueRuntimeClient.forRoute(args.executionHostId).mutate('conversations.prepareResume', {
      mutationId: crypto.randomUUID(),
      launchToken: args.launchToken,
      workspaceRef: args.workspaceRef,
      workspaceSnapshot: { name: args.workspaceSnapshot.name, path: args.workspaceSnapshot.path },
      agent: args.agent,
      providerSession: args.providerSession
    })
    return { recorded: true }
  } catch (error) {
    console.warn('[issues] resume book-keeping failed; resuming anyway:', error)
    return { recorded: false }
  }
}
