import { describe, expect, it } from 'vitest'
import type {
  ArtifactShareLookupResult,
  ArtifactShareServiceStatus,
  ArtifactSharedWorkspace
} from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import { ARTIFACT_SHARE_ERROR_CODES } from '../../../../../shared/self-hosted-artifacts/artifact-share-errors'
import {
  initialLanShareState,
  lanShareReducer,
  lanShareViewFromLookup,
  type LanShareState
} from './lan-artifact-share-machine'

const SERVING: ArtifactShareServiceStatus = {
  state: 'serving',
  port: 18787,
  ip: '192.168.1.20',
  ipCandidates: ['192.168.1.20']
}

const WORKSPACE: ArtifactSharedWorkspace = {
  token: 'AbCdEfGhIjKlMnOpQrStUv',
  rootPath: '/Users/me/octo',
  label: 'octo',
  createdAt: '2026-09-16T12:00:00.000Z',
  urlBase: 'http://192.168.1.20:18787/AbCdEfGhIjKlMnOpQrStUv/',
  linkedFiles: []
}

function lookup(
  service: ArtifactShareServiceStatus,
  workspace: ArtifactSharedWorkspace | null
): ArtifactShareLookupResult {
  return {
    host: { executionHostId: 'ssh:minizc', label: 'minizc' },
    service,
    file: {
      workspace,
      rootPath: '/Users/me/octo',
      workspaceLabel: 'octo',
      relativePath: 'docs/plan.md',
      url: workspace && service.state === 'serving' ? `${workspace.urlBase}docs/plan.md` : null
    }
  }
}

describe('lan share view', () => {
  it('shows the link while the owner serves a shared workspace', () => {
    expect(lanShareViewFromLookup(lookup(SERVING, WORKSPACE))).toEqual({
      kind: 'shared',
      workspace: WORKSPACE,
      url: 'http://192.168.1.20:18787/AbCdEfGhIjKlMnOpQrStUv/docs/plan.md'
    })
    expect(lanShareViewFromLookup(lookup(SERVING, null))).toEqual({
      kind: 'unshared',
      relativePath: 'docs/plan.md',
      workspaceLabel: 'octo'
    })
  })

  it('blocks on the owner service state and keeps the workspace so it can be stopped', () => {
    const cases: [ArtifactShareServiceStatus, string, number | null][] = [
      [{ state: 'sharing-off' }, 'sharing-off', null],
      [{ state: 'orca-not-running' }, 'orca-not-running', null],
      [{ state: 'port-conflict', port: 18787 }, 'port-conflict', 18787],
      [{ state: 'failed', reason: 'EACCES', logPath: null }, 'serve-failed', null],
      [{ state: 'unverifiable', reason: 'disconnected' }, 'unreachable', null],
      [{ state: 'unverifiable', reason: 'host-outdated' }, 'outdated', null]
    ]
    for (const [service, reason, port] of cases) {
      expect(lanShareViewFromLookup(lookup(service, WORKSPACE))).toMatchObject({
        kind: 'blocked',
        reason,
        port,
        workspace: WORKSPACE
      })
    }
  })
})

describe('lan share reducer', () => {
  const unshared: LanShareState = lanShareReducer(initialLanShareState, {
    type: 'check-succeeded',
    result: lookup(SERVING, null)
  })

  it('maps coded failures to blocked views and anything else to a retryable failure', () => {
    expect(
      lanShareReducer(initialLanShareState, {
        type: 'check-failed',
        code: ARTIFACT_SHARE_ERROR_CODES.hostUnreachable,
        message: "Can't reach minizc."
      }).view
    ).toMatchObject({ kind: 'blocked', reason: 'unreachable' })
    expect(
      lanShareReducer(initialLanShareState, {
        type: 'check-failed',
        code: null,
        message: 'boom'
      }).view
    ).toEqual({ kind: 'check-failed', message: 'boom' })
  })

  it('keeps the unshared view with an inline error when sharing fails for another reason', () => {
    const sharing = lanShareReducer(unshared, { type: 'share-started' })
    expect(sharing.busy).toBe('sharing')
    const failed = lanShareReducer(sharing, { type: 'share-failed', code: null, message: 'boom' })
    expect(failed).toMatchObject({ busy: null, actionError: 'boom', view: unshared.view })
    const blocked = lanShareReducer(sharing, {
      type: 'share-failed',
      code: ARTIFACT_SHARE_ERROR_CODES.sharingDisabled,
      message: 'off'
    })
    expect(blocked.view).toMatchObject({ kind: 'blocked', reason: 'sharing-off' })
  })

  it('remembers the owner while re-checking', () => {
    const checking = lanShareReducer(unshared, { type: 'check-started' })
    expect(checking.view).toEqual({ kind: 'checking' })
    expect(checking.host).toEqual({ executionHostId: 'ssh:minizc', label: 'minizc' })
  })
})
