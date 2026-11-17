import { useAppStore } from '../../store'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { getConnectionId } from '@/lib/connection-context'
import type { TerminalPasteSource, TerminalPasteTextOptions } from './terminal-paste-model'
import {
  resolveTerminalPasteRuntime,
  resolveTerminalPasteRuntimeEnvironmentId
} from './terminal-paste-runtime'
import { captureTerminalPasteOwnership } from '@/terminal-paste-ownership/terminal-paste-ownership'
import { formatTerminalPasteOwnershipFailure } from '@/terminal-paste-ownership/terminal-paste-failure'
import { createTerminalPasteFeedback } from '@/terminal-paste-ownership/terminal-paste-feedback'
import { pasteTextIntoTerminalPane } from './terminal-pane-paste-dispatch'
import { formatTerminalPasteExecutionError } from './terminal-paste-errors'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import type { ReadClipboardTextOptions } from '../../../../shared/clipboard-text'
import type { TerminalPaneCloseController } from './use-terminal-pane-close-actions'
import { resolveProtectedMultilinePasteOptionsForPane } from './terminal-agent-paste-bracketing'
import { resolveTerminalInputHostPlatform } from './terminal-input-host-platform'

export type TerminalPanePasteExecution = ReturnType<typeof createTerminalPanePasteExecution>

export function formatClipboardImagePasteError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `Image paste failed: ${detail}`
}

export function createTerminalPanePasteExecution(
  controller: TerminalPaneCloseController,
  shortcutPlatform: NodeJS.Platform
) {
  const {
    forceBracketedMultilineTextPaste,
    managerRef,
    paneTransportsRef,
    setTerminalErrorsByPaneId,
    tabId,
    worktreeId
  } = controller
  const beginPasteFeedback = createTerminalPasteFeedback(setTerminalErrorsByPaneId)
  const capturePanePasteOwnership = (pane: ManagedPane, source: TerminalPasteSource) => ({
    ...captureTerminalPasteOwnership({
      paneContainer: pane.container,
      requireFocus: source === 'keyboard' || source === 'paste-event' || source === 'app-menu',
      readTargetState: () => {
        const transport = paneTransportsRef.current.get(pane.id)
        return {
          manager: managerRef.current,
          paneTransports: paneTransportsRef.current,
          paneId: pane.id,
          leafId: pane.leafId,
          transport,
          ptyId: transport?.getPtyId() ?? null
        }
      }
    }),
    feedback: beginPasteFeedback(pane.id)
  })

  const executePanePasteText = async (
    pane: ManagedPane,
    source: TerminalPasteSource,
    ownership: ReturnType<typeof capturePanePasteOwnership>,
    text: string,
    options?: TerminalPasteTextOptions
  ): Promise<boolean> => {
    const { transport, ptyId } = ownership
    const execution = await pasteTextIntoTerminalPane({
      pane,
      text,
      source,
      ptyId,
      runtime: resolveTerminalPasteRuntime({
        platform: shortcutPlatform,
        ptyId,
        transport,
        isWindowsConpty: forceBracketedMultilineTextPaste
      }),
      transport,
      inputKind: 'driving',
      isTargetCurrent: ownership.isTargetCurrent,
      canContinue: ownership.canContinue,
      planOptions: options
    })
    if (execution.status !== 'pasted') {
      ownership.feedback.fail(
        execution.reason === 'stale-target'
          ? formatTerminalPasteOwnershipFailure(ownership.getFailure())
          : formatTerminalPasteExecutionError(execution.reason)
      )
      return false
    }
    ownership.feedback.succeed()
    if (text) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
    return true
  }

  // Resolve per pane/PTY host: Windows Codex needs input-record newlines even beside other protocols.
  const resolvePaneProtectedMultilinePasteOptions = (
    pane: ManagedPane
  ): TerminalPasteTextOptions | undefined => {
    const state = useAppStore.getState()
    const options = resolveProtectedMultilinePasteOptionsForPane({
      isWindowsClient: forceBracketedMultilineTextPaste,
      hostPlatform: resolveTerminalInputHostPlatform({
        clientPlatform: shortcutPlatform,
        state,
        worktreeId,
        transport: paneTransportsRef.current.get(pane.id) ?? null
      }),
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      paneForegroundAgentByPaneKey: state.paneForegroundAgentByPaneKey,
      tabId,
      leafId: pane.leafId
    })
    // Why: non-Windows clients keep xterm's own bracketing; only the Windows input-record contract is added.
    return forceBracketedMultilineTextPaste || options?.windowsInputRecordNewline
      ? options
      : undefined
  }

  const pasteFromClipboard = (
    pane: ManagedPane,
    source: Extract<TerminalPasteSource, 'keyboard' | 'paste-event' | 'app-menu'>,
    readClipboardText: (options?: ReadClipboardTextOptions) => Promise<string> = window.api.ui
      .readClipboardText
  ): void => {
    const connectionId = getConnectionId(worktreeId) ?? null
    const runtimeEnvironmentId = resolveTerminalPasteRuntimeEnvironmentId(
      useAppStore.getState(),
      worktreeId,
      paneTransportsRef.current.get(pane.id)
    )
    const ownership = capturePanePasteOwnership(pane, source)
    void pasteTerminalClipboard({
      readClipboardText,
      saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
      connectionId,
      runtimeEnvironmentId,
      protectedMultilineTextPasteOptions: resolvePaneProtectedMultilinePasteOptions(pane),
      pasteText: (text, options) => executePanePasteText(pane, source, ownership, text, options),
      onTextPasteError: () =>
        ownership.feedback.fail(
          'Paste failed: clipboard text is too large for a safe terminal paste.'
        ),
      onImagePasteError: (error) => ownership.feedback.fail(formatClipboardImagePasteError(error))
    }).catch(() => {
      ownership.feedback.fail('Paste failed.')
    })
  }

  return { executePanePasteText, pasteFromClipboard, resolvePaneProtectedMultilinePasteOptions }
}
