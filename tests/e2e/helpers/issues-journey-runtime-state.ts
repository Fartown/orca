import { expect, type Page } from '@stablyai/playwright-test'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  ORCA_ISSUES_RUNTIME_CAPABILITY,
  RUNTIME_PROTOCOL_VERSION
} from '../../../src/shared/protocol-version'

export async function injectRuntimeFailureMatrix(page: Page): Promise<void> {
  await installIssueRuntimeSimulator(page)
  const environments = [
    runtimeEnvironment('legacy-runtime', 'Legacy Runtime', Date.now()),
    runtimeEnvironment('offline-runtime', 'Offline Runtime', Date.now())
  ]
  await page.evaluate((runtimeEnvironments) => {
    const appStore = window.__store
    const simulator = window.__issuesJourneyRuntimeSimulator
    if (!appStore || !simulator) {
      throw new Error('E2E runtime simulator unavailable')
    }
    simulator.mode = 'failure'
    appStore.getState().setRuntimeEnvironments(runtimeEnvironments)
  }, environments)

  await expect(page.getByText('This Orca host version does not support Issues.')).toBeVisible({
    timeout: 20_000
  })
  await expect(page.getByText('Offline runtime is unreachable')).toBeVisible({ timeout: 20_000 })
}

export async function injectRuntimeAuthorityTree(page: Page): Promise<string> {
  await installIssueRuntimeSimulator(page)
  const environment = runtimeEnvironment('journey-runtime', 'Journey Runtime', Date.now())
  await page.evaluate((runtime) => {
    const appStore = window.__store
    const simulator = window.__issuesJourneyRuntimeSimulator
    if (!appStore || !simulator) {
      throw new Error('E2E runtime simulator unavailable')
    }
    simulator.mode = 'authority'
    simulator.generation = 'a'
    appStore.getState().setRuntimeEnvironments([runtime])
  }, environment)

  const generationA = page.getByText('Runtime generation A', { exact: true })
  await expect(generationA).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    const simulator = window.__issuesJourneyRuntimeSimulator
    if (!simulator) {
      throw new Error('E2E runtime simulator unavailable')
    }
    simulator.generation = 'b'
  })
  await expect(page.getByText('Runtime generation B', { exact: true })).toBeVisible({
    timeout: 20_000
  })
  await expect(generationA).toBeHidden()
  return 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
}

async function installIssueRuntimeSimulator(page: Page): Promise<void> {
  await page.evaluate(
    ({ protocolVersion, minClientVersion, issuesCapability }) => {
      if (window.__issuesJourneyRuntimeSimulator) {
        return
      }
      const simulator = {
        mode: 'failure' as 'failure' | 'authority',
        generation: 'a' as 'a' | 'b'
      }
      window.__issuesJourneyRuntimeSimulator = simulator
      const success = (runtimeId: string, result: unknown) => ({
        id: `issues-journey-${runtimeId}`,
        ok: true as const,
        result,
        _meta: { runtimeId }
      })
      const failure = (runtimeId: string, message: string) => ({
        id: `issues-journey-${runtimeId}`,
        ok: false as const,
        error: { code: 'runtime_unavailable', message },
        _meta: { runtimeId }
      })
      const status = (runtimeId: string, capabilities: string[]) =>
        success(runtimeId, {
          runtimeId,
          rendererGraphEpoch: 1,
          graphStatus: 'ready',
          authoritativeWindowId: 0,
          desktopWindowStatus: 'blocked',
          liveTabCount: 0,
          liveLeafCount: 0,
          runtimeProtocolVersion: protocolVersion,
          minCompatibleRuntimeClientVersion: minClientVersion,
          capabilities,
          appVersion: 'issues-journey-runtime'
        })
      window.__runtimeEnvironmentCallE2E = async (request) => {
        const { environmentId, method } = request
        if (!['legacy-runtime', 'offline-runtime', 'journey-runtime'].includes(environmentId)) {
          return window.api.runtimeEnvironments.call({
            selector: environmentId,
            method,
            params: request.params,
            timeoutMs: request.timeoutMs,
            expectedEnvironmentPairingRevision: request.expectedEnvironmentPairingRevision
          })
        }
        if (method === 'status.get') {
          return environmentId === 'legacy-runtime'
            ? status(environmentId, [])
            : status(environmentId, [issuesCapability])
        }
        if (environmentId === 'legacy-runtime') {
          return failure(environmentId, 'Legacy runtime does not support Issues')
        }
        if (environmentId === 'offline-runtime') {
          return failure(environmentId, 'Offline runtime is unreachable')
        }
        const authority = runtimeAuthority(simulator.generation)
        if (method === 'issues.status') {
          return success(environmentId, {
            status: 'ready',
            storage: 'ready',
            hookEvidence: 'ready',
            reason: null,
            authority
          })
        }
        if (method === 'issues.list') {
          return success(environmentId, runtimeIssuePage(authority, simulator.generation))
        }
        if (method === 'issues.get') {
          const issue = runtimeIssuePage(authority, simulator.generation).issues[0]
          return success(environmentId, {
            authority,
            issue,
            directChildren: [],
            directConversations: [],
            workspaceSnapshots: []
          })
        }
        if (method === 'issues.listRounds') {
          return success(environmentId, {
            status: 'snapshot-page',
            authority,
            snapshotFactsRevision: simulator.generation === 'a' ? 1 : 2,
            rounds: [],
            nextCursor: null
          })
        }
        if (method === 'conversations.list') {
          return success(environmentId, {
            status: 'snapshot-page',
            authority,
            snapshotFactsRevision: simulator.generation === 'a' ? 1 : 2,
            snapshotRuntimeRevision: 0,
            conversations: [],
            nextCursor: null
          })
        }
        return failure(environmentId, `Unexpected Issues Journey RPC ${method}`)
      }

      function runtimeAuthority(generation: 'a' | 'b') {
        return {
          authorityId:
            generation === 'a'
              ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
              : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          hostPartitionKey: 'local' as const,
          authorityExecutionHostId: 'local' as const,
          profileLabel: 'Runtime Profile B'
        }
      }

      function runtimeIssuePage(
        authority: ReturnType<typeof runtimeAuthority>,
        generation: 'a' | 'b'
      ) {
        const revision = generation === 'a' ? 1 : 2
        return {
          status: 'snapshot-page' as const,
          authority,
          snapshotFactsRevision: revision,
          snapshotTreeRevision: revision,
          snapshotRuntimeRevision: 0,
          issues: [
            {
              id:
                generation === 'a'
                  ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
                  : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              hostPartitionKey: 'local' as const,
              executionHostId: 'local' as const,
              source: { kind: 'local' as const, number: revision },
              localTitle: `Runtime generation ${generation.toUpperCase()}`,
              typeLabel: null,
              note: null,
              state: 'active' as const,
              parentId: null,
              siblingOrder: 0,
              recordRevision: 0,
              createdAt: revision,
              updatedAt: revision,
              archivedAt: null,
              ownUnresolvedCount: 0,
              descendantAttentionCount: 0,
              directConversationCount: 0,
              runningConversationCount: 0
            }
          ],
          nextCursor: null
        }
      }
    },
    {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      minClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
      issuesCapability: ORCA_ISSUES_RUNTIME_CAPABILITY
    }
  )
}

function runtimeEnvironment(id: string, name: string, now: number) {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [
      {
        id: `ws-${id}`,
        kind: 'websocket' as const,
        label: 'WebSocket',
        endpoint: 'ws://127.0.0.1:1'
      }
    ],
    preferredEndpointId: `ws-${id}`
  }
}
