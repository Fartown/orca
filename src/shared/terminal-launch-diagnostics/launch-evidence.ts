import { sha256 } from '../sha256'
import { parsePaneKey } from '../stable-pane-id'

export type LaunchEvidence = Record<string, string | number | boolean | null>

export function launchField(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined
}

export function launchReference(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) {
    return null
  }
  return Array.from(sha256(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

function tabReference(value: unknown): string | null {
  return launchReference(typeof value === 'string' ? value.replace(/^web-terminal-/, '') : value)
}

export function providerReference(agent: unknown, session: unknown): string | null {
  const id = launchField(session, 'id')
  return typeof agent === 'string' && typeof id === 'string'
    ? launchReference(`${agent}\0${id}`)
    : null
}

export function launchEvidence(input: unknown): LaunchEvidence {
  const agent = launchField(input, 'launchAgent') ?? launchField(input, 'agent')
  const provider =
    launchField(input, 'resumeProviderSession') ?? launchField(input, 'providerSession')
  return {
    diagnosticVersion: 1,
    sourcePaneRef: launchReference(launchField(input, 'paneKey')),
    eventPhase: launchField(input, 'eventPhase') === 'created' ? 'created' : 'requested',
    automaticResume: launchField(input, 'automaticResumeClaim') != null,
    requestedSource:
      launchField(input, 'source') === 'runtime-session' ? 'runtime-session' : 'unspecified',
    launchSourceRef: launchReference(launchField(launchField(input, 'telemetry'), 'launch_source')),
    requestKindRef: launchReference(launchField(launchField(input, 'telemetry'), 'request_kind')),
    worktreeRef: launchReference(
      launchField(input, 'worktreeId') ?? launchField(input, 'worktree')
    ),
    tabRef: tabReference(launchField(input, 'tabId')),
    leafRef: launchReference(launchField(input, 'leafId')),
    ptyRef: launchReference(launchField(input, 'ptyId') ?? launchField(input, 'sessionId')),
    handleRef: launchReference(
      launchField(input, 'handle') ?? launchField(input, 'preAllocatedHandle')
    ),
    incarnationRef: launchReference(launchField(input, 'incarnationId')),
    candidatePtyRef: launchReference(launchField(input, 'candidatePtyId')),
    isReattach: launchField(input, 'isReattach') === true,
    providerRef: providerReference(agent, provider),
    connectionRef: launchReference(launchField(input, 'connectionId')),
    requestRef: launchReference(launchField(input, 'requestId')),
    hasCommand: typeof launchField(input, 'command') === 'string',
    hasProviderIdentity: provider !== undefined && provider !== null,
    hasOwnerClaim: launchField(input, 'agentSessionEnsure') != null,
    claimRef: launchReference(
      launchField(launchField(launchField(input, 'agentSessionEnsure'), 'claim'), 'identityDigest')
    ),
    hasRequestedSession: typeof launchField(input, 'sessionId') === 'string',
    attachOnly: launchField(input, 'attachOnly') === true,
    ssh: typeof launchField(input, 'connectionId') === 'string',
    paired: typeof launchField(input, 'environmentId') === 'string'
  }
}

export function launchCandidateEvidence(input: unknown, state: unknown): LaunchEvidence {
  const evidence: LaunchEvidence = {}
  const paneKey = launchField(input, 'paneKey')
  const pane = typeof paneKey === 'string' ? parsePaneKey(paneKey) : null
  if (pane) {
    const ids = launchField(launchField(state, 'ptyIdsByTabId'), pane.tabId)
    const layout = launchField(launchField(state, 'terminalLayoutsByTabId'), pane.tabId)
    const tabs = launchField(
      launchField(state, 'tabsByWorktree'),
      String(launchField(input, 'worktreeId'))
    )
    evidence.sourcePaneHasRendererPty = Array.isArray(ids) && ids.length > 0
    evidence.sourcePaneHasPersistedBinding =
      typeof launchField(launchField(layout, 'ptyIdsByLeafId'), pane.leafId) === 'string'
    evidence.sourcePaneHasTab =
      Array.isArray(tabs) && tabs.some((tab) => launchField(tab, 'id') === pane.tabId)
  }
  const ref = providerReference(
    launchField(input, 'launchAgent') ?? launchField(input, 'agent'),
    launchField(input, 'resumeProviderSession') ?? launchField(input, 'providerSession')
  )
  const statuses = launchField(state, 'agentStatusByPaneKey')
  if (!ref || statuses === null || typeof statuses !== 'object') {
    return evidence
  }
  let count = 0
  for (const entry of Object.values(statuses)) {
    if (
      providerReference(launchField(entry, 'agentType'), launchField(entry, 'providerSession')) !==
      ref
    ) {
      continue
    }
    const index = count++
    if (index >= 8) {
      continue
    }
    const tabId = launchField(entry, 'tabId')
    const paneKey = launchField(entry, 'paneKey')
    const liveIds =
      typeof tabId === 'string'
        ? launchField(launchField(state, 'ptyIdsByTabId'), tabId)
        : undefined
    evidence[`candidate${index}PaneRef`] = launchReference(paneKey)
    evidence[`candidate${index}TabRef`] = tabReference(tabId)
    evidence[`candidate${index}HasLivePty`] = Array.isArray(liveIds) && liveIds.length > 0
    const status = launchField(entry, 'state')
    evidence[`candidate${index}State`] = ['working', 'done', 'waiting', 'blocked'].includes(
      String(status)
    )
      ? String(status)
      : 'unknown'
  }
  evidence.candidateCount = count
  evidence.candidatesOmitted = Math.max(0, count - 8)
  return evidence
}
