import { resolveRuntimePaneTitleLeafId } from '@/lib/runtime-pane-title-leaf-id'
import { parseExecutionHostId, toSshExecutionHostId } from '../../../../shared/execution-host'
import { parseRemoteRuntimePtyId } from '../../../../shared/remote-runtime-pty-id'
import { parseAppSshPtyId } from '../../../../shared/ssh-pty-id'
import { parseLegacyNumericPaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  AiVaultOriginalPaneSessionReference,
  AiVaultOriginalPaneTarget,
  OriginalPaneState
} from './ai-vault-original-pane'

function findTabPtyId(
  state: OriginalPaneState,
  tabId: string,
  leafId: string,
  worktreeIdHint?: string
): string | null {
  const layout = state.terminalLayoutsByTabId[tabId]
  const leafPtyId = layout?.ptyIdsByLeafId?.[leafId]
  if (leafPtyId) {
    return leafPtyId
  }
  if (layout?.root?.type !== 'leaf' || layout.root.leafId !== leafId) {
    return null
  }
  if (worktreeIdHint) {
    const hintedTab = (state.tabsByWorktree[worktreeIdHint] ?? []).find((tab) => tab.id === tabId)
    if (hintedTab) {
      return hintedTab.ptyId ?? null
    }
  }
  for (const tabs of Object.values(state.tabsByWorktree)) {
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (tab) {
      return tab.ptyId ?? null
    }
  }
  return null
}

function panePtyId(args: {
  state: OriginalPaneState
  paneKey: string
  worktreeIdHint?: string
  tabIdHint?: string
}): string | null {
  const stable = parsePaneKey(args.paneKey)
  if (stable && (!args.tabIdHint || args.tabIdHint === stable.tabId)) {
    return findTabPtyId(args.state, stable.tabId, stable.leafId, args.worktreeIdHint)
  }
  const legacy = parseLegacyNumericPaneKey(args.paneKey)
  if (!legacy || (args.tabIdHint && args.tabIdHint !== legacy.tabId)) {
    return null
  }
  const leafId = resolveRuntimePaneTitleLeafId(
    args.state.terminalLayoutsByTabId[legacy.tabId],
    legacy.numericPaneId
  )
  return leafId ? findTabPtyId(args.state, legacy.tabId, leafId, args.worktreeIdHint) : null
}

function ptyMatchesExecutionHost(args: {
  ptyId: string | null
  session: AiVaultOriginalPaneSessionReference
  connectionId?: string | null
}): boolean {
  if (!args.session.executionHostId) {
    return true
  }
  const expectedHost = parseExecutionHostId(args.session.executionHostId)
  if (!expectedHost) {
    return false
  }
  if (args.ptyId) {
    const runtimePty = parseRemoteRuntimePtyId(args.ptyId)
    if (runtimePty) {
      return (
        expectedHost.kind === 'runtime' &&
        runtimePty.environmentId !== null &&
        runtimePty.environmentId === expectedHost.environmentId
      )
    }
    const sshPty = parseAppSshPtyId(args.ptyId)
    if (sshPty) {
      return (
        expectedHost.kind === 'ssh' && toSshExecutionHostId(sshPty.connectionId) === expectedHost.id
      )
    }
    if (args.ptyId.startsWith('remote:') || args.ptyId.startsWith('ssh:')) {
      return false
    }
  }
  const normalizedConnectionId = args.connectionId?.trim()
  if (normalizedConnectionId) {
    return (
      expectedHost.kind === 'ssh' &&
      toSshExecutionHostId(normalizedConnectionId) === expectedHost.id
    )
  }
  if (args.ptyId) {
    return expectedHost.kind === 'local'
  }
  // Legacy local rows can omit routing; unowned remote PTYs already failed closed above.
  return expectedHost.kind === 'local'
}

export function paneEntryMatchesExecutionHost(args: {
  state: OriginalPaneState
  session: AiVaultOriginalPaneSessionReference
  paneKey: string
  worktreeIdHint?: string
  tabIdHint?: string
  connectionId?: string | null
}): boolean {
  return ptyMatchesExecutionHost({
    ptyId: panePtyId(args),
    session: args.session,
    connectionId: args.connectionId
  })
}

export function originalPaneTargetMatchesExecutionHost(args: {
  state: OriginalPaneState
  session: AiVaultOriginalPaneSessionReference
  target: AiVaultOriginalPaneTarget
  connectionId?: string | null
}): boolean {
  return ptyMatchesExecutionHost({
    ptyId: findTabPtyId(args.state, args.target.tabId, args.target.leafId, args.target.worktreeId),
    session: args.session,
    connectionId: args.connectionId
  })
}
