import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
  type TestInfo
} from '@stablyai/playwright-test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  AuthorityExecutionHostId,
  ConversationSummary,
  IssueSummary,
  RoundRecordPreview
} from '../../../src/shared/issues/types'
import { getE2ECompletedOnboardingProfile } from './e2e-completed-onboarding-profile'
import {
  assertElectronResolvedIsolatedHome,
  createElectronHomeIsolation
} from './electron-home-isolation'
import { cleanupE2EDaemons, closeElectronAppForE2E } from './electron-process-shutdown'
import { getGoldenStubAgentLaunchEnv } from './golden-stub-agent'

type LaunchedPackagedOrca = {
  app: ElectronApplication
  page: Page
}

type ProfileIndex = {
  activeProfileId: string
  profiles: { id: string; name: string }[]
}

type SnapshotPage<T> = {
  status: 'snapshot-page'
  nextCursor: string | null
} & T

export type PackagedIssuesJourney = {
  userDataDir: string
  isolatedHome: string
  executablePath: string
  launch(extraEnv?: Record<string, string>): Promise<LaunchedPackagedOrca>
  close(app: ElectronApplication): Promise<void>
  dispose(): Promise<void>
  setActiveProfile(profileId: string): void
  setProfileSettings(profileId: string, updates: Record<string, unknown>): void
  makeIssueDatabaseUnavailable(profileId: string): void
  issueDatabasePath(profileId: string): string
  seedCodexTranscript(sessionId: string, cwd: string): string
}

export function createPackagedIssuesJourney(testInfo: TestInfo): PackagedIssuesJourney {
  const userDataDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-issues-journey-')))
  const executablePath = packagedExecutablePath()
  const { ELECTRON_RUN_AS_NODE: _unused, ...cleanEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv: cleanEnv,
    launchEnv: getGoldenStubAgentLaunchEnv(),
    extraEnv: {},
    userDataDir
  })
  writeFileSync(
    path.join(userDataDir, 'orca-data.json'),
    `${JSON.stringify(initialProfileData(), null, 2)}\n`
  )

  const launch = async (extraEnv: Record<string, string> = {}): Promise<LaunchedPackagedOrca> => {
    const app = await electron.launch({
      executablePath,
      args: [...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []), '--lang=en-US'],
      env: {
        ...isolation.env,
        ...extraEnv,
        ORCA_E2E_HEADLESS: '1',
        ORCA_E2E_ISSUES_HOOK: '1',
        ORCA_E2E_RUNTIME_WS_PORT: '0'
      }
    })
    const startup = await app.evaluate(({ app: electronApp }) => ({
      home: electronApp.getPath('home'),
      packaged: electronApp.isPackaged
    }))
    expect(startup.packaged, 'issues-journey must run the build:unpack application').toBe(true)
    assertElectronResolvedIsolatedHome(startup.home, isolation)
    const page = await app.firstWindow({ timeout: 120_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.waitForFunction(
      () => Boolean(window.api && window.__store && window.__issueDomainStore),
      null,
      { timeout: 30_000 }
    )
    await page.waitForFunction(
      () => window.__store?.getState().workspaceSessionReady === true,
      null,
      { timeout: 30_000 }
    )
    testInfo.attachments.push({
      name: 'packaged-executable',
      contentType: 'text/plain',
      body: Buffer.from(executablePath)
    })
    return { app, page }
  }

  return {
    userDataDir,
    isolatedHome: isolation.isolatedHome,
    executablePath,
    launch,
    close: closeElectronAppForE2E,
    dispose: async () => {
      await cleanupE2EDaemons(userDataDir)
      if (process.env.ORCA_E2E_PRESERVE_ISSUES_PROFILE !== '1') {
        rmSync(userDataDir, { recursive: true, force: true })
      }
    },
    setActiveProfile: (profileId) => {
      const indexPath = path.join(userDataDir, 'orca-profile-index.json')
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as ProfileIndex
      if (!index.profiles.some((profile) => profile.id === profileId)) {
        throw new Error(`Unknown Issue journey profile ${profileId}`)
      }
      writeJsonAtomically(indexPath, { ...index, activeProfileId: profileId })
    },
    setProfileSettings: (profileId, updates) => {
      const dataPath = path.join(userDataDir, 'profiles', profileId, 'orca-data.json')
      mkdirSync(path.dirname(dataPath), { recursive: true })
      const baseline = initialProfileData()
      const current = existsSync(dataPath)
        ? (JSON.parse(readFileSync(dataPath, 'utf8')) as Record<string, unknown>)
        : {}
      const baselineSettings = isRecord(baseline.settings) ? baseline.settings : {}
      const settings = isRecord(current.settings) ? current.settings : {}
      writeJsonAtomically(dataPath, {
        ...baseline,
        ...current,
        settings: { ...baselineSettings, ...settings, ...updates }
      })
    },
    makeIssueDatabaseUnavailable: (profileId) => {
      const databasePath = issueDatabasePath(userDataDir, profileId)
      mkdirSync(databasePath, { recursive: true })
    },
    issueDatabasePath: (profileId) => issueDatabasePath(userDataDir, profileId),
    seedCodexTranscript: (sessionId, cwd) => {
      const directory = path.join(isolation.isolatedHome, '.codex', 'sessions', '2026', '08', '25')
      mkdirSync(directory, { recursive: true })
      const transcriptPath = path.join(directory, `rollout-2026-08-25T00-00-00-${sessionId}.jsonl`)
      writeFileSync(
        transcriptPath,
        `${JSON.stringify({
          timestamp: '2026-08-25T00:00:00.000Z',
          type: 'session_meta',
          payload: { id: sessionId, cwd }
        })}\n${JSON.stringify({
          timestamp: '2026-08-25T00:00:01.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'Issues journey resume evidence' }
        })}\n`
      )
      return transcriptPath
    }
  }
}

export async function runtimeRpc<TResult>(
  page: Page,
  method: string,
  params: Record<string, unknown>,
  authorityExecutionHostId: AuthorityExecutionHostId = 'local'
): Promise<TResult> {
  return page.evaluate(
    async ({ method, params, authorityExecutionHostId }) => {
      const response = await window.api.runtime.call({
        method,
        params: { ...params, authorityExecutionHostId }
      })
      if (!response.ok) {
        throw new Error(`${response.error.code}: ${response.error.message}`)
      }
      return response.result as TResult
    },
    { method, params, authorityExecutionHostId }
  )
}

export async function transferProject(
  page: Page,
  args: {
    sourceProfileId: string
    targetProfileId: string
    repoId: string
    mode: 'copy' | 'move'
  }
): Promise<{ status: string }> {
  return page.evaluate((input) => window.api.orcaProfiles.transferProject(input), args)
}

export async function listIssues(
  page: Page,
  authorityExecutionHostId: AuthorityExecutionHostId = 'local'
): Promise<IssueSummary[]> {
  const result = await runtimeRpc<SnapshotPage<{ issues: IssueSummary[] }>>(
    page,
    'issues.list',
    { mode: 'start', filter: 'all', limit: 200 },
    authorityExecutionHostId
  )
  return result.status === 'snapshot-page' ? result.issues : []
}

export async function listConversations(
  page: Page,
  authorityExecutionHostId: AuthorityExecutionHostId = 'local'
): Promise<ConversationSummary[]> {
  const result = await runtimeRpc<SnapshotPage<{ conversations: ConversationSummary[] }>>(
    page,
    'conversations.list',
    { mode: 'start', scope: { kind: 'authority' }, limit: 200 },
    authorityExecutionHostId
  )
  return result.status === 'snapshot-page' ? result.conversations : []
}

export async function listRounds(page: Page, issueId: string): Promise<RoundRecordPreview[]> {
  const result = await runtimeRpc<SnapshotPage<{ rounds: RoundRecordPreview[] }>>(
    page,
    'issues.listRounds',
    { mode: 'start', scope: { kind: 'issue', issueId }, limit: 200 }
  )
  return result.status === 'snapshot-page' ? result.rounds : []
}

function packagedExecutablePath(): string {
  const override = process.env.ORCA_E2E_PACKAGED_EXECUTABLE?.trim()
  if (override) {
    const executable = path.resolve(override)
    if (!existsSync(executable)) {
      throw new Error(`Missing overridden packaged application executable at ${executable}`)
    }
    return executable
  }
  const relative =
    process.platform === 'darwin'
      ? path.join(
          'dist',
          process.arch === 'arm64' ? 'mac-arm64' : 'mac',
          'Orca.app',
          'Contents',
          'MacOS',
          'Orca'
        )
      : process.platform === 'win32'
        ? path.join('dist', 'win-unpacked', 'Orca.exe')
        : path.join(
            'dist',
            process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
            'orca-ide'
          )
  const executable = path.join(process.cwd(), relative)
  if (!existsSync(executable)) {
    throw new Error(`Missing build:unpack application executable at ${executable}`)
  }
  return executable
}

function initialProfileData(): Record<string, unknown> {
  const initial = getE2ECompletedOnboardingProfile()
  return {
    ...initial,
    settings: {
      ...initial.settings,
      agentStatusHooksEnabled: true,
      defaultTuiAgent: 'codex',
      agentCmdOverrides: { codex: 'golden-stub-agent' },
      agentDefaultArgs: { codex: '' }
    }
  }
}

function issueDatabasePath(userDataDir: string, profileId: string): string {
  return path.join(userDataDir, 'profiles', profileId, 'issues', 'orca-issues.db')
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.issues-journey.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporaryPath, filePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
