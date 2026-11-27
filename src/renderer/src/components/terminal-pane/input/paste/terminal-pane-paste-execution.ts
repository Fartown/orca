import { recordRecentTerminalImage } from '../recent-terminal-images'
import { useAppStore } from '../../../../store/index'
import { readRuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager-types'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
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
import { recordTerminalUserInputForLeaf } from '../terminal-input-activity'
import { scheduleImagePasteWebglAtlasRecovery } from '../../render-health/terminal-webgl-atlas-recovery'
import { pasteTerminalClipboard } from '../../clipboard/terminal-clipboard-paste'
import { createTerminalClipboardCopiedFiles } from '../../clipboard/terminal-clipboard-copied-files'
import type { ReadClipboardTextOptions } from '../../../../../../shared/clipboard/clipboard-text'
import type { TerminalPaneCloseController } from '../../layout/close/use-terminal-pane-close-actions'
import { resolveProtectedMultilinePasteOptionsForPane } from './terminal-agent-paste-bracketing'
import { resolveTerminalInputHostPlatform } from '../terminal-input-host-platform'
import {
  reportUnpastedClipboardEventFiles,
  requestNativePasteForUnreadWindowsClipboard
} from './terminal-unread-clipboard-native-paste'

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
    cwd,
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
        statuses: readRuntimeStatuses(),
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

  const createPaneClipboardCopiedFiles = (pane: ManagedPane) =>
    createTerminalClipboardCopiedFiles({
      managerRef,
      paneTransportsRef,
      worktreeId,
      tabId,
      cwd,
      pane
    })

  const pasteFromClipboard = (
    pane: ManagedPane,
    source: Extract<TerminalPasteSource, 'keyboard' | 'paste-event' | 'app-menu'>,
    {
      readClipboardText = window.api.ui.readClipboardText,
      eventCopiedFilePaths,
      eventCarriedFiles = false,
      isUnreadWindowsClipboardFallback = false
    }: {
      readClipboardText?: (options?: ReadClipboardTextOptions) => Promise<string>
      eventCopiedFilePaths?: string[]
      eventCarriedFiles?: boolean
      isUnreadWindowsClipboardFallback?: boolean
    } = {}
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
      copiedFiles: createPaneClipboardCopiedFiles(pane),
      eventCopiedFilePaths,
      connectionId,
      runtimeEnvironmentId,
      onLocalImagePasted: (path) => recordRecentTerminalImage(pane.terminal, path, true),
      protectedMultilineTextPasteOptions: resolvePaneProtectedMultilinePasteOptions(pane),
      pasteText: (text, options) => executePanePasteText(pane, source, ownership, text, options),
      onTextPasteError: () =>
        ownership.feedback.fail(
          'Paste failed: clipboard text is too large for a safe terminal paste.'
        ),
      onImagePasteError: (error) => ownership.feedback.fail(formatClipboardImagePasteError(error))
    })
      .then((result) => {
        // The paste event this may trigger must not fall back again.
        if (source !== 'paste-event') {
          requestNativePasteForUnreadWindowsClipboard(result, pane)
        } else if (
          isUnreadWindowsClipboardFallback ||
          !eventCarriedFiles ||
          !requestNativePasteForUnreadWindowsClipboard(result, pane)
        ) {
          reportUnpastedClipboardEventFiles(result, eventCarriedFiles)
        }
      })
      .catch(() => {
        ownership.feedback.fail('Paste failed.')
      })
  }

  return {
    createPaneClipboardCopiedFiles,
    executePanePasteText,
    pasteFromClipboard,
    resolvePaneProtectedMultilinePasteOptions
  }
}
