import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEGATIVE_ENTRY_TTL_MS } from '../git/remote-ref-probe-cache'
import { _resetGiteaRepoRefCache, type GiteaRepoRef } from '../gitea/repository-ref'
import { detectHostedReviewProvider } from '../source-control/forge-provider'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { _resetGiteaHostProbeCache, confirmGiteaRepoRef, probeGiteaHost } from './gitea-host-probe'

const execFileAsync = promisify(execFile)
const OLD_ENV = process.env

const REPO: GiteaRepoRef = {
  host: 'forge.example.test',
  owner: 'team',
  repo: 'repo',
  apiBaseUrl: 'https://forge.example.test/api/v1',
  webBaseUrl: 'https://forge.example.test'
}

function stubFetch(respond: () => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => respond())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('Gitea host probe', () => {
  beforeEach(() => {
    _resetGiteaHostProbeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    _resetGiteaHostProbeCache()
  })

  it.each([
    ['Gitea version JSON', () => Response.json({ version: '1.22.0' }), 'gitea'],
    ['Forgejo version JSON', () => Response.json({ version: '7.0.0+gitea-1.22.0' }), 'gitea'],
    [
      'sign-in-only API',
      () => new Response('{"message":"token is required"}', { status: 401 }),
      'gitea'
    ],
    ['forbidden API', () => new Response('', { status: 403 }), 'gitea'],
    [
      'service error page',
      () => new Response('service discovery failure', { status: 500 }),
      'not-gitea'
    ],
    ['missing route', () => new Response('Not Found', { status: 404 }), 'not-gitea'],
    [
      'sign-in page after a redirect',
      () => new Response('<html><body>Sign in</body></html>', { status: 200 }),
      'not-gitea'
    ],
    ['JSON without a version', () => Response.json({ name: 'other forge' }), 'not-gitea'],
    ['bad gateway', () => new Response('', { status: 502 }), 'unverifiable'],
    ['unavailable', () => new Response('', { status: 503 }), 'unverifiable'],
    ['gateway timeout', () => new Response('', { status: 504 }), 'unverifiable'],
    ['rate limited', () => new Response('', { status: 429 }), 'unverifiable'],
    [
      'network failure',
      () => {
        throw new TypeError('fetch failed')
      },
      'unverifiable'
    ]
  ])('classifies %s', async (_name, respond, verdict) => {
    stubFetch(respond)
    await expect(probeGiteaHost(REPO.apiBaseUrl)).resolves.toBe(verdict)
  })

  it('drops the ref only for a host that answered as something else', async () => {
    stubFetch(() => new Response('service discovery failure', { status: 500 }))
    await expect(confirmGiteaRepoRef(REPO, { apiBaseConfigured: false })).resolves.toBeNull()

    _resetGiteaHostProbeCache()
    stubFetch(() => new Response('', { status: 503 }))
    await expect(confirmGiteaRepoRef(REPO, { apiBaseConfigured: false })).resolves.toBe(REPO)
  })

  it('trusts an explicitly configured Gitea API base without probing', async () => {
    const fetchMock = stubFetch(() => new Response('', { status: 500 }))
    await expect(confirmGiteaRepoRef(REPO, { apiBaseConfigured: true })).resolves.toBe(REPO)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shares one probe per API base and re-asks a non-Gitea host after the negative TTL', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00Z'), toFake: ['Date'] })
    const fetchMock = stubFetch(() => new Response('service discovery failure', { status: 500 }))

    await Promise.all([probeGiteaHost(REPO.apiBaseUrl), probeGiteaHost(REPO.apiBaseUrl)])
    await probeGiteaHost(REPO.apiBaseUrl)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(Date.now() + NEGATIVE_ENTRY_TTL_MS + 1))
    await probeGiteaHost(REPO.apiBaseUrl)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache an unverifiable answer', async () => {
    const fetchMock = stubFetch(() => new Response('', { status: 502 }))
    await probeGiteaHost(REPO.apiBaseUrl)
    await probeGiteaHost(REPO.apiBaseUrl)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('hosted review on a self-hosted forge that is not Gitea', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, ORCA_GITEA_TOKEN: 'local-token' }
    delete process.env.ORCA_GITEA_API_BASE_URL
    _resetGiteaRepoRefCache()
    _resetGiteaHostProbeCache()
  })

  afterEach(() => {
    process.env = OLD_ENV
    _resetGiteaRepoRefCache()
    _resetGiteaHostProbeCache()
  })

  it('reports no provider and never calls the Gitea pull request API', async () => {
    const seen: { pathname: string; authorization: string | undefined }[] = []
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      seen.push({ pathname: url.pathname, authorization: req.headers.authorization })
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('service discovery failure')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    const repoPath = await mkdtemp(join(tmpdir(), 'orca-non-gitea-forge-'))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('expected TCP server address')
      }
      await execFileAsync('git', ['init'], { cwd: repoPath })
      await execFileAsync(
        'git',
        ['remote', 'add', 'origin', `http://127.0.0.1:${address.port}/team/repo.git`],
        { cwd: repoPath }
      )

      await expect(
        detectHostedReviewProvider({ repoPath, executionHostId: 'local' })
      ).resolves.toBe('unsupported')
      await expect(
        getHostedReviewForBranch({
          executionHostId: 'local',
          repoPath,
          branch: 'refs/heads/feature/review'
        })
      ).resolves.toBeNull()

      expect(seen).toEqual([{ pathname: '/api/v1/version', authorization: undefined }])
    } finally {
      await rm(repoPath, { recursive: true, force: true })
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
