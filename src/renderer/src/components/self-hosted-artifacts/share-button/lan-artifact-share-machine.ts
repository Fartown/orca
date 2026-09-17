import type {
  ArtifactShareHostLabel,
  ArtifactShareLookupResult,
  ArtifactShareServiceStatus,
  ArtifactSharedWorkspace
} from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import { ARTIFACT_SHARE_ERROR_CODES } from '../../../../../shared/self-hosted-artifacts/artifact-share-errors'

export type LanShareBlockedReason =
  | 'sharing-off'
  | 'orca-not-running'
  | 'unreachable'
  | 'outdated'
  | 'port-conflict'
  | 'serve-failed'
  | 'path-denied'
  | 'unsupported'

export type LanShareView =
  | { kind: 'checking' }
  | {
      kind: 'blocked'
      reason: LanShareBlockedReason
      message: string
      port: number | null
      workspace: ArtifactSharedWorkspace | null
    }
  | { kind: 'unshared'; relativePath: string; workspaceLabel: string }
  | { kind: 'shared'; workspace: ArtifactSharedWorkspace; url: string }
  | { kind: 'check-failed'; message: string }

export type LanShareState = {
  view: LanShareView
  host: ArtifactShareHostLabel | null
  busy: 'sharing' | 'stopping' | null
  actionError: string | null
}

export type LanShareEvent =
  | { type: 'check-started' }
  | { type: 'check-succeeded'; result: ArtifactShareLookupResult }
  | { type: 'check-failed'; code: string | null; message: string }
  | { type: 'share-started' }
  | { type: 'share-succeeded'; result: ArtifactShareLookupResult }
  | { type: 'share-failed'; code: string | null; message: string }
  | { type: 'stop-started' }
  | { type: 'stop-failed'; message: string }

export const initialLanShareState: LanShareState = {
  view: { kind: 'checking' },
  host: null,
  busy: null,
  actionError: null
}

const BLOCKING_CODES: Record<string, LanShareBlockedReason> = {
  [ARTIFACT_SHARE_ERROR_CODES.sharingDisabled]: 'sharing-off',
  [ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning]: 'orca-not-running',
  [ARTIFACT_SHARE_ERROR_CODES.hostUnreachable]: 'unreachable',
  [ARTIFACT_SHARE_ERROR_CODES.hostOutdated]: 'outdated',
  [ARTIFACT_SHARE_ERROR_CODES.portConflict]: 'port-conflict',
  [ARTIFACT_SHARE_ERROR_CODES.serveFailed]: 'serve-failed',
  [ARTIFACT_SHARE_ERROR_CODES.pathDenied]: 'path-denied',
  [ARTIFACT_SHARE_ERROR_CODES.unsupportedHost]: 'unsupported'
}

function blockedByService(
  service: ArtifactShareServiceStatus,
  workspace: ArtifactSharedWorkspace | null
): LanShareView | null {
  switch (service.state) {
    case 'serving':
      return null
    case 'sharing-off':
      return { kind: 'blocked', reason: 'sharing-off', message: '', port: null, workspace }
    case 'orca-not-running':
      return { kind: 'blocked', reason: 'orca-not-running', message: '', port: null, workspace }
    case 'port-conflict':
      return {
        kind: 'blocked',
        reason: 'port-conflict',
        message: '',
        port: service.port,
        workspace
      }
    case 'failed':
      return {
        kind: 'blocked',
        reason: 'serve-failed',
        message: service.reason,
        port: null,
        workspace
      }
    case 'unverifiable':
      return {
        kind: 'blocked',
        reason: service.reason === 'host-outdated' ? 'outdated' : 'unreachable',
        message: '',
        port: null,
        workspace
      }
  }
}

export function lanShareViewFromLookup(result: ArtifactShareLookupResult): LanShareView {
  const blocked = blockedByService(result.service, result.file.workspace)
  if (blocked) {
    return blocked
  }
  if (result.file.workspace && result.file.url) {
    return { kind: 'shared', workspace: result.file.workspace, url: result.file.url }
  }
  return {
    kind: 'unshared',
    relativePath: result.file.relativePath,
    workspaceLabel: result.file.workspaceLabel
  }
}

export function lanShareReducer(state: LanShareState, event: LanShareEvent): LanShareState {
  switch (event.type) {
    case 'check-started':
      return { ...initialLanShareState, host: state.host }
    case 'check-succeeded':
    case 'share-succeeded':
      return {
        view: lanShareViewFromLookup(event.result),
        host: event.result.host,
        busy: null,
        actionError: null
      }
    case 'check-failed': {
      const reason = event.code ? BLOCKING_CODES[event.code] : undefined
      return {
        ...state,
        busy: null,
        view: reason
          ? { kind: 'blocked', reason, message: event.message, port: null, workspace: null }
          : { kind: 'check-failed', message: event.message }
      }
    }
    case 'share-started':
      return { ...state, busy: 'sharing', actionError: null }
    case 'share-failed': {
      const reason = event.code ? BLOCKING_CODES[event.code] : undefined
      return reason
        ? {
            ...state,
            busy: null,
            view: { kind: 'blocked', reason, message: event.message, port: null, workspace: null }
          }
        : { ...state, busy: null, actionError: event.message }
    }
    case 'stop-started':
      return { ...state, busy: 'stopping', actionError: null }
    case 'stop-failed':
      return { ...state, busy: null, actionError: event.message }
  }
}
