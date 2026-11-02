import { nativeChatPaneHeader as nativeChatPaneTitleBar } from '@/components/native-chat/NativeChatPaneHeader'
import { structuredAgentSessionPaneKey } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import { LocalTaskSessionChip } from './LocalTaskSessionChip'

/**
 * The structured chat's pane header plus its task chip. The chip is absolutely placed, so beside the
 * out-of-flow title bar it lands on the transcript's top-left corner as it did inside the transcript.
 */
export function nativeChatPaneHeader(
  ...args: Parameters<typeof nativeChatPaneTitleBar>
): React.JSX.Element {
  const [view, worktreeId] = args
  return (
    <>
      {nativeChatPaneTitleBar(...args)}
      <LocalTaskSessionChip
        pane={{
          worktreeId,
          paneKey: structuredAgentSessionPaneKey(view.tabId, view.sessionId),
          sessionId: view.sessionId
        }}
      />
    </>
  )
}
