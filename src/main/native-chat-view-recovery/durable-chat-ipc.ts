import { registerNativeChatHandlers } from '../ipc/native-chat'
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { ALL_RPC_METHODS } from '../runtime/rpc/methods/rpc-method-registry'
import { DESKTOP_RPC_CALLER } from '../runtime/rpc/callers/rpc-caller-identity'
import { DESKTOP_RENDERER_RUNTIME_CLIENT_CAPABILITIES } from '../ipc/runtime-client/desktop-renderer-runtime-capabilities'
import { parseAppSshPtyId } from '../../shared/remote-runtime/ssh/ssh-pty-id'
import { parseRemoteRuntimePtyId } from '../../shared/remote-runtime/remote-runtime-pty-id'
import { resolveEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import { callRuntimeEnvironment } from '../ipc/runtime-environments/requests/runtime-environment-transport-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../ipc/runtime-environments/catalog/runtime-environment-registry-root'
import { getRuntimeEnvironmentStatusSnapshots } from '../ipc/runtime-environments/connections/runtime-environment-request-connections'
import { runtimeEnvironmentStatusFromSnapshot } from '../../shared/remote-runtime/host-status/runtime-host-status'
import {
  runtimeHostConnectionState,
  isConnectedRuntimeHostState
} from '../../shared/remote-runtime/host-status/runtime-host-connection-state'
import { getSshConnectionManager } from '../ssh/targets/ssh-target-registry'
import { parseExecutionHostId } from '../../shared/execution-host/execution-host'
import {
  DURABLE_CHAT_COMPOSER_CAPABILITY,
  DurableChatEvidenceList
} from '../../shared/native-chat-view-recovery/durable-chat-submit'
import { DurableChatOutbox } from './durable-chat-outbox'
import { DurableChatSubmitter } from './durable-chat-submitter'

const TerminalTarget = z.object({
  terminal: z.object({
    ptyId: z.string(),
    incarnationId: z.string(),
    executionHostId: z.string().optional()
  })
})

export function registerTerminalChatHandlers(runtime: OrcaRuntimeService): void {
  registerNativeChatHandlers()
  registerDurableChatHandlers(runtime)
}

function registerDurableChatHandlers(runtime: OrcaRuntimeService): void {
  const dispatcher = new RpcDispatcher({ runtime, methods: ALL_RPC_METHODS })
  const localCall = (method: string, params: unknown, requestId?: string) =>
    dispatcher.dispatch(
      {
        id: 'desktop-chat',
        authToken: 'desktop-ipc',
        method,
        params,
        orchestrationRequestId: requestId
      },
      {
        caller: DESKTOP_RPC_CALLER,
        clientKind: 'runtime',
        clientCapabilities: DESKTOP_RENDERER_RUNTIME_CLIENT_CAPABILITIES
      }
    )
  const requireContact = (environmentId: string) => {
    const snapshot = getRuntimeEnvironmentStatusSnapshots().find(
      (s) => s.environmentId === environmentId
    )
    const entry = snapshot ? runtimeEnvironmentStatusFromSnapshot(snapshot) : null
    if (
      !entry ||
      !isConnectedRuntimeHostState(
        runtimeHostConnectionState({
          hasStatusEntry: true,
          status: entry.status,
          remoteControl: entry.remoteControl,
          transportStatus: snapshot?.transport === 'ready' ? 'connected' : 'disconnected'
        })
      )
    ) {
      throw new Error('Chat host is out of contact')
    }
    return snapshot
  }
  const submitter = new DurableChatSubmitter(
    new DurableChatOutbox(join(app.getPath('userData'), 'native-chat-outbox', 'submissions.json')),
    {
      prepare: async (args) => {
        if (parseAppSshPtyId(args.ptyId)) {
          throw new Error(
            'This legacy SSH terminal needs a managed host for reliable Chat; input has been kept'
          )
        }
        const owner = parseRemoteRuntimePtyId(args.ptyId)
        const environmentId = owner?.environmentId ?? null
        let terminal: string
        let runtimeId: string
        let pairingRevision: number | undefined
        let installationId: string | undefined
        let shown: z.infer<typeof TerminalTarget>
        if (environmentId) {
          const snapshot = requireContact(environmentId)
          if (!snapshot?.status?.capabilities?.includes(DURABLE_CHAT_COMPOSER_CAPABILITY)) {
            throw new Error('Chat host needs an update for reliable submission')
          }
          const environment = await resolveEnvironment(
            getRuntimeEnvironmentRegistryRoot(),
            environmentId
          )
          runtimeId = snapshot.status.runtimeId
          installationId = snapshot.status.hostDescriptor?.installationId
          pairingRevision = environment.pairingRevision
          if (!owner) {
            throw new Error('Chat host identity is unavailable')
          }
          terminal = owner.handle
          const response = await callRuntimeEnvironment(
            getRuntimeEnvironmentRegistryRoot(),
            environmentId,
            'terminal.show',
            { terminal },
            15000,
            pairingRevision,
            undefined,
            { expectedEnvironmentRuntimeId: runtimeId }
          )
          if (!response.ok) {
            throw new Error(response.error.message)
          }
          shown = TerminalTarget.parse(response.result)
        } else {
          if (owner) {
            throw new Error('Chat host identity is unavailable')
          }
          terminal = runtime.getTerminalHandleForPaneKey(args.paneKey) ?? ''
          const binding = runtime.getTerminalPromptRequestBinding(terminal)
          if (binding.ptyId !== args.ptyId) {
            throw new Error('terminal_handle_stale')
          }
          if (!runtime.getStatus().capabilities?.includes(DURABLE_CHAT_COMPOSER_CAPABILITY)) {
            throw new Error('Chat host needs durable storage for reliable submission')
          }
          shown = TerminalTarget.parse({ terminal: await runtime.showTerminal(terminal) })
          runtimeId = runtime.getStatus().runtimeId
        }
        const executionHostId = environmentId
          ? `runtime:${encodeURIComponent(environmentId)}`
          : (shown.terminal.executionHostId ?? 'local')
        const host = parseExecutionHostId(executionHostId)
        if (
          host?.kind === 'ssh' &&
          getSshConnectionManager()?.getState(host.targetId)?.status !== 'connected'
        ) {
          throw new Error('Chat host is out of contact')
        }
        return {
          terminal,
          runtimeId,
          pairingRevision,
          environmentId,
          executionHostId,
          installationId,
          hostPtyId: shown.terminal.ptyId,
          processIncarnation: shown.terminal.incarnationId
        }
      },
      call: async (record, method, params, requestId) => {
        if (record.environmentId) {
          const snapshot = requireContact(record.environmentId)
          if (
            method !== 'terminal.send' &&
            (!record.installationId ||
              snapshot?.status?.hostDescriptor?.installationId !== record.installationId)
          ) {
            throw new Error('Chat host identity changed')
          }
          return callRuntimeEnvironment(
            getRuntimeEnvironmentRegistryRoot(),
            record.environmentId,
            method,
            params,
            15000,
            record.pairingRevision,
            { orchestrationRequestId: requestId },
            {
              expectedEnvironmentRuntimeId:
                method === 'terminal.send' ? record.runtimeId : snapshot?.status?.runtimeId
            }
          )
        }
        if (record.runtimeId !== runtime.getStatus().runtimeId && method === 'terminal.send') {
          throw new Error('Chat runtime changed before submission')
        }
        const host = parseExecutionHostId(record.executionHostId)
        if (
          host?.kind === 'ssh' &&
          getSshConnectionManager()?.getState(host.targetId)?.status !== 'connected'
        ) {
          throw new Error('Chat host is out of contact')
        }
        return localCall(method, params, requestId)
      },
      changed: () => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send('nativeChat:outboxChanged')
          }
        }
      }
    }
  )
  const guard = (event: IpcMainInvokeEvent): void => {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Chat requires current main frame')
    }
  }
  ipcMain.handle('nativeChat:prepareSubmit', (event, args) => {
    guard(event)
    return submitter.prepare(args)
  })
  ipcMain.handle('nativeChat:dispatchSubmit', (event, id) => {
    guard(event)
    return submitter.dispatch(z.string().uuid().parse(id))
  })
  ipcMain.handle('nativeChat:listSubmits', (event, paneKey) => {
    guard(event)
    return submitter.list(z.string().parse(paneKey))
  })
  ipcMain.handle('nativeChat:querySubmit', (event, id) => {
    guard(event)
    return submitter.query(z.string().uuid().parse(id))
  })
  ipcMain.handle('nativeChat:confirmSubmit', (event, paneKey, sessionId, evidenceJson) => {
    guard(event)
    return submitter.confirm(
      z.string().parse(paneKey),
      z.string().parse(sessionId),
      DurableChatEvidenceList.parse(JSON.parse(z.string().parse(evidenceJson)))
    )
  })
}
