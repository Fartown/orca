import { registerTerminalPaneRecoveryInstance } from '../components/terminal-pane/render-health/recovery/terminal-pane-recovery'
import { paneIsCoveredByNativeChat } from '../components/terminal-pane/chat/native-chat-covered-pane'

type RecoverableTerminalSession = {
  deps: { tabId: string; isVisibleRef: { readonly current: boolean } }
  pane: { container: Pick<Element, 'querySelector'> }
}

/** Register the pane's recovery instance with its real visibility and chat cover, read at request time. */
export function registerTerminalChatRecoveryInstance(
  session: RecoverableTerminalSession
): ReturnType<typeof registerTerminalPaneRecoveryInstance> {
  return registerTerminalPaneRecoveryInstance(
    session.deps.tabId,
    () => session.deps.isVisibleRef.current && paneIsCoveredByNativeChat(session.pane)
  )
}
