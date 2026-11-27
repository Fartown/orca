// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteServerUpdateDialog } from '../components/settings/runtime-environments/updates/RemoteServerUpdateDialog'
import {
  inspectRemoteServerUpdate,
  type RemoteServerUpdateEntry,
  type RemoteServerUpdateTransport
} from '../runtime/hosts/updates/remote-server-update-coordinator'
import { useAppStore } from '../store'

type EnvironmentArg = Parameters<typeof inspectRemoteServerUpdate>[0]

const sampleChangelog = {
  releasesBehind: null,
  release: {
    title: 'Orca 1.4.214-preview.103',
    description: 'fix(session-names): 全链路统一会话命名 · 新功能：Goal 模式 (#152)',
    releaseNotesUrl: 'https://github.com/Fartown/orca/releases/tag/integration-103-5f72d6e481cd'
  }
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('remote and web server update changelog display', () => {
  it('retains the target execution host changelog across local web and SSH server update checks', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: inspection reads only id, name and orcadDeployment.
    const environment = {
      id: 'ssh-dbox',
      name: 'dbox'
    } as EnvironmentArg
    const transport: RemoteServerUpdateTransport = {
      getRuntimeStatus: async () => ({
        appVersion: '1.4.214-preview.100',
        runtimeId: 'rt-1',
        rendererGraphEpoch: 1,
        graphStatus: 'ready',
        authoritativeWindowId: null,
        liveTabCount: 2,
        liveLeafCount: 2,
        capabilities: ['updater.remote-control.v1'],
        remoteUpdateSupport: {
          installMode: 'supervised-headless-serve',
          automatic: true,
          reason: 'available'
        }
      }),
      getUpdaterStatus: async () => {
        throw new Error('not called')
      },
      check: async () => ({
        appVersion: '1.4.214-preview.100',
        runtimeId: 'rt-1',
        support: {
          installMode: 'supervised-headless-serve',
          automatic: true,
          reason: 'available'
        },
        status: {
          state: 'available',
          version: '1.4.214-preview.103',
          changelog: sampleChangelog
        }
      }),
      download: async () => {
        throw new Error('not called')
      },
      install: async () => {
        throw new Error('not called')
      },
      wait: async () => {}
    }

    const entry = await inspectRemoteServerUpdate(environment, 'web', transport, {})
    expect(entry).toMatchObject({
      phase: 'available',
      currentVersion: '1.4.214-preview.100',
      targetVersion: '1.4.214-preview.103',
      changelog: sampleChangelog
    })
  })

  it('triggers an active check on open and renders the server changelog in RemoteServerUpdateDialog', () => {
    const refresh = vi.fn(async () => {})
    const entry: RemoteServerUpdateEntry = {
      environmentId: 'env-dbox',
      name: 'dbox',
      phase: 'available',
      currentVersion: '1.4.214-preview.100',
      targetVersion: '1.4.214-preview.103',
      progress: null,
      runtimeId: 'rt-1',
      liveTabCount: 1,
      liveLeafCount: 1,
      support: {
        installMode: 'supervised-headless-serve',
        automatic: true,
        reason: 'available'
      },
      error: null,
      changelog: sampleChangelog
    }
    useAppStore.setState({
      remoteServerUpdateDialogOpen: true,
      remoteServerUpdates: new Map([[entry.environmentId, entry]]),
      refreshRemoteServerUpdates: refresh
    })

    render(<RemoteServerUpdateDialog />)
    expect(refresh).toHaveBeenCalledWith({})
    expect(
      screen.getByText('fix(session-names): 全链路统一会话命名 · 新功能：Goal 模式 (#152)')
    ).toBeTruthy()
    expect(screen.getByText('1.4.214-preview.100 → 1.4.214-preview.103')).toBeTruthy()
  })
})
