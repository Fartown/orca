/**
 * A RESUMED agent that has not finished a turn yet must still be findable as an
 * original pane.
 *
 * Codex only emits a hook when a turn completes, so a pane resumed into an idle
 * agent names its provider session nowhere the original-pane finder used to
 * look: `agentStatusByPaneKey` is empty for it, and resume already consumed the
 * sleeping record. Both the Session History panel and the Issues shortcut then
 * offered Resume for a session that was already open, and codex refused the
 * second writer with `already has an active writer (code -32600)`.
 *
 * Run:
 *   pnpm exec playwright test tests/e2e/ai-vault-hook-silent-resume-original-pane.spec.ts \
 *     --config tests/playwright.config.ts --project electron-headless --workers=1
 */
import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { TEST_REPO_PATH_FILE } from './global-setup'
import { waitForActiveTerminalManager, waitForPaneCount } from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'

const PROVIDER_SESSION_ID = 'e2e-hook-silent-resume-session'

test.describe.configure({ mode: 'serial' })

test('a hook-silent resumed pane stays findable as its session original pane', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
  if (!repoPath || !existsSync(repoPath)) {
    test.skip(true, 'Global setup did not produce a seeded test repo')
    return
  }

  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null

  try {
    const launched = await session.launch()
    app = launched.app
    const page = await app.firstWindow()
    const worktreeId = await attachRepoAndOpenTerminal(page, repoPath)
    await waitForSessionReady(page)
    await waitForActiveWorktree(page)
    await ensureTerminalVisible(page)
    await waitForActiveTerminalManager(page, 30_000)
    await waitForPaneCount(page, 1, 30_000)

    // The transcript AI Vault will discover for this provider session.
    const transcriptPath = session.seedCodexResumeRollout(PROVIDER_SESSION_ID, repoPath)

    // Resume the session exactly the way the native launcher does: one atomic
    // createTab carrying the startup command and its resume identity. `echo`
    // keeps the pane hermetic and — like an idle codex — silent.
    const resumedTabId = await page.evaluate(
      ({ worktreeId: wtId, providerSessionId, transcriptPath }) => {
        const tab = window.__store?.getState().createTab(wtId, undefined, undefined, {
          launchAgent: 'codex',
          pendingStartup: {
            command: `echo resumed ${providerSessionId}`,
            launchConfig: { agentCommand: 'echo', agentArgs: '', agentEnv: {} },
            launchAgent: 'codex',
            resumeProviderSession: {
              key: 'session_id',
              id: providerSessionId,
              transcriptPath
            }
          }
        })
        return tab?.id ?? null
      },
      { worktreeId, providerSessionId: PROVIDER_SESSION_ID, transcriptPath }
    )
    expect(resumedTabId, 'the resume launch must create a tab').not.toBeNull()

    // The pane binds its PTY and registers the launch config for this identity.
    const readRegistration = async (): Promise<{
      paneKey: string
      agentType: string | null
      providerSessionId: string | null
    } | null> =>
      page.evaluate((tabId) => {
        const state = window.__store?.getState()
        const hit = Object.entries(state?.agentLaunchConfigByPaneKey ?? {}).find(([paneKey]) =>
          paneKey.startsWith(`${tabId}:`)
        )
        return hit
          ? {
              paneKey: hit[0],
              agentType: hit[1]?.identity?.agentType ?? null,
              providerSessionId: hit[1]?.identity?.providerSession?.id ?? null
            }
          : null
      }, resumedTabId!)

    await expect
      .poll(async () => (await readRegistration()) !== null, {
        timeout: 30_000,
        message: 'the resumed pane never registered a launch config'
      })
      .toBe(true)
    const registered = await readRegistration()

    // THE FIX: the resume identity rides the launch-config registry.
    expect(registered?.providerSessionId, 'the resumed pane must carry its provider identity').toBe(
      PROVIDER_SESSION_ID
    )
    expect(registered?.agentType).toBe('codex')

    // THE ACCIDENT'S PRECONDITION: nothing else in the renderer names this
    // session, because the resumed agent never finished a turn.
    const otherSources = await page.evaluate((providerSessionId) => {
      const state = window.__store?.getState()
      const namedByStatus = Object.values(state?.agentStatusByPaneKey ?? {}).some(
        (entry) => entry?.providerSession?.id === providerSessionId
      )
      const namedByRetained = Object.values(state?.retainedAgentsByPaneKey ?? {}).some(
        (retained) => retained?.entry?.providerSession?.id === providerSessionId
      )
      const namedBySleeping = Object.values(state?.sleepingAgentSessionsByPaneKey ?? {}).some(
        (record) => record?.providerSession?.id === providerSessionId
      )
      return { namedByStatus, namedByRetained, namedBySleeping }
    }, PROVIDER_SESSION_ID)
    expect(
      otherSources,
      'the pane must be hook-silent, or this test no longer reproduces the accident'
    ).toEqual({ namedByStatus: false, namedByRetained: false, namedBySleeping: false })

    // The pane the finder must return still resolves: same tab, live leaf.
    const paneSurface = await page.evaluate(
      ({ tabId, paneKey, worktreeId: wtId }) => {
        const state = window.__store?.getState()
        const leafId = paneKey.slice(tabId.length + 1)
        const layout = state?.terminalLayoutsByTabId?.[tabId]
        const layoutHasLeaf = (node: unknown): boolean => {
          if (!node || typeof node !== 'object') {
            return false
          }
          const record = node as {
            type?: string
            leafId?: string
            first?: unknown
            second?: unknown
          }
          return record.type === 'leaf'
            ? record.leafId === leafId
            : layoutHasLeaf(record.first) || layoutHasLeaf(record.second)
        }
        return {
          tabBelongsToWorktree: (state?.tabsByWorktree?.[wtId] ?? []).some(
            (tab) => tab.id === tabId
          ),
          leafIsLive: layoutHasLeaf(layout?.root) || Boolean(layout?.ptyIdsByLeafId?.[leafId])
        }
      },
      { tabId: resumedTabId!, paneKey: registered!.paneKey, worktreeId }
    )
    expect(paneSurface, 'the resumed pane must still resolve to a live tab and leaf').toEqual({
      tabBelongsToWorktree: true,
      leafIsLive: true
    })

    // AI Vault really discovers the session the pane resumed, so the finder is
    // matching against a row the user can actually click.
    const readVaultSession = async (): Promise<{ agent: string; sessionId: string } | null> =>
      page.evaluate(async (providerSessionId) => {
        const result = await window.api.aiVault.listSessions({ unlimited: true })
        const hit = result.sessions.find((entry) => entry.sessionId === providerSessionId)
        return hit ? { agent: hit.agent, sessionId: hit.sessionId } : null
      }, PROVIDER_SESSION_ID)

    await expect
      .poll(async () => (await readVaultSession()) !== null, {
        timeout: 30_000,
        message: 'AI Vault never discovered the seeded rollout'
      })
      .toBe(true)
    const vaultSession = await readVaultSession()
    expect(vaultSession).toEqual({ agent: 'codex', sessionId: PROVIDER_SESSION_ID })

    // The finder's predicate over this real state: same agent, same session id,
    // resolvable pane. Its unit tests own the traversal itself.
    expect(registered?.agentType).toBe(vaultSession?.agent)
    expect(registered?.providerSessionId).toBe(vaultSession?.sessionId)
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
  }
})
