import { ipcRenderer } from 'electron'
import type {
  NativeChatAppendedPayload,
  NativeChatReadSessionResult,
  NativeChatSubscriptionFrame,
  PreloadApi
} from '../api-types'
import type { AgentType } from '../../shared/agent-status-types'

export const nativeChatApi = {
  durableSubmit: {
    prepare: (args) => ipcRenderer.invoke('nativeChat:prepareSubmit', args),
    dispatch: (id) => ipcRenderer.invoke('nativeChat:dispatchSubmit', id),
    list: (paneKey) => ipcRenderer.invoke('nativeChat:listSubmits', paneKey),
    query: (id) => ipcRenderer.invoke('nativeChat:querySubmit', id),
    confirm: (paneKey, sessionId, evidenceJson) =>
      ipcRenderer.invoke('nativeChat:confirmSubmit', paneKey, sessionId, evidenceJson),
    onChanged: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('nativeChat:outboxChanged', listener)
      return () => ipcRenderer.removeListener('nativeChat:outboxChanged', listener)
    }
  },
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string,
    options?: { wakeWslDistro?: boolean }
  ): Promise<NativeChatReadSessionResult> =>
    ipcRenderer.invoke('nativeChat:readSession', {
      agent,
      sessionId,
      limit,
      transcriptPath,
      wakeWslDistro: options?.wakeWslDistro
    }),
  subscribe: (
    args: {
      subscriptionId: string
      agent: AgentType
      sessionId: string
      transcriptPath?: string
      limit?: number
      wakeWslDistro?: boolean
    },
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: NativeChatAppendedPayload) => {
      if (payload.subscriptionId === args.subscriptionId) {
        onFrame(payload.frame)
      }
    }
    ipcRenderer.on('nativeChat:appended', listener)
    ipcRenderer.send('nativeChat:subscribe', args)
    return () => {
      ipcRenderer.removeListener('nativeChat:appended', listener)
      ipcRenderer.send('nativeChat:unsubscribe', { subscriptionId: args.subscriptionId })
    }
  },
  getConversationNameFailureOutput: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke('nativeChat:conversationNameFailureOutput', sessionId)
} satisfies PreloadApi['nativeChat']
