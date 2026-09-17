import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { ArtifactShareServiceStatus } from '../../../shared/self-hosted-artifacts/artifact-share-contract'
import { readArtifactShareConfig, updateArtifactShareConfig } from '../store/artifact-share-config'
import { writeArtifactShareServingState } from '../store/artifact-share-serving-state'
import { artifactShareLogPath } from '../store/artifact-share-store-layout'
import { createArtifactShareRequestHandler } from './artifact-share-http-handler'
import { chooseArtifactShareIp, listArtifactShareIpCandidates } from './artifact-share-lan-ip'
import {
  listenOnArtifactSharePort,
  listenOnFallbackArtifactSharePort
} from './artifact-share-listener'
import { createArtifactShareServeLog } from './artifact-share-serve-log'
import {
  acquireArtifactShareServingLock,
  type ArtifactShareServingLockRelease
} from './artifact-share-serving-lock'
import { readArtifactShareServingStatus } from './artifact-share-serving-status'
import type { ArtifactShareViewerAssets } from './artifact-share-viewer-assets'

const MAX_CONNECTIONS = 256
const IP_REFRESH_INTERVAL_MS = 60_000

export type ArtifactShareAppServerDeps = {
  home: string
  computerLabel: string
  viewer: ArtifactShareViewerAssets | null
  listIpCandidates?: () => Promise<string[]>
  acquireLock?: typeof acquireArtifactShareServingLock
  readExternalStatus?: (home: string) => Promise<ArtifactShareServiceStatus>
}

type Active =
  | {
      mode: 'serving'
      server: Server
      release: ArtifactShareServingLockRelease
      instance: string
      port: number
      ip: string | null
      ipChoice: string
      candidates: string[]
      refresh: NodeJS.Timeout
    }
  | { mode: 'port-conflict'; release: ArtifactShareServingLockRelease; port: number }

/**
 * The share server lives inside the Orca app and follows it: it serves while the app runs with
 * sharing on, and stops when the app quits or sharing is turned off.
 */
export class ArtifactShareAppServer {
  private enabled = false
  private active: Active | null = null
  private failure: string | null = null
  private queue: Promise<void> = Promise.resolve()
  private readonly log

  constructor(private readonly deps: ArtifactShareAppServerDeps) {
    this.log = createArtifactShareServeLog(artifactShareLogPath(deps.home))
  }

  setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    return this.enqueue(() => this.reconcile())
  }

  /** Re-listens after a port change; links change with the port by design. */
  restart(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopActive()
      await this.reconcile()
    })
  }

  stop(): Promise<void> {
    this.enabled = false
    return this.enqueue(() => this.stopActive())
  }

  /** Re-reads the pinned address without re-listening, so existing tokens and ports stay valid. */
  refreshAddress(): Promise<void> {
    return this.enqueue(() => this.refreshIp())
  }

  async status(): Promise<ArtifactShareServiceStatus> {
    await this.queue
    if (!this.enabled) {
      return { state: 'sharing-off' }
    }
    if (this.active?.mode === 'serving') {
      return {
        state: 'serving',
        port: this.active.port,
        ip: this.active.ip ?? '127.0.0.1',
        ipCandidates: this.active.candidates,
        ipChoice: this.active.ipChoice
      }
    }
    if (this.active?.mode === 'port-conflict') {
      return { state: 'port-conflict', port: this.active.port }
    }
    if (this.failure) {
      return {
        state: 'failed',
        reason: this.failure,
        logPath: artifactShareLogPath(this.deps.home)
      }
    }
    const external = await (this.deps.readExternalStatus ?? readArtifactShareServingStatus)(
      this.deps.home
    )
    if (external.state === 'orca-not-running') {
      // Why: the process that held the lock is gone, so this app takes over instead of reporting nobody.
      await this.enqueue(() => this.reconcile())
      return this.active ? this.status() : external
    }
    return external
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => {})
    return next
  }

  private async reconcile(): Promise<void> {
    if (!this.enabled) {
      await this.stopActive()
      await this.recordSharingOff()
      return
    }
    if (this.active?.mode === 'serving') {
      return
    }
    await this.stopActive()
    await this.start()
  }

  private async recordSharingOff(): Promise<void> {
    const release = await (this.deps.acquireLock ?? acquireArtifactShareServingLock)(
      this.deps.home,
      () => {}
    )
    if (!release) {
      return
    }
    writeArtifactShareServingState(this.deps.home, this.idleState('sharing-off'))
    await release()
  }

  private async start(): Promise<void> {
    this.failure = null
    const release = await (this.deps.acquireLock ?? acquireArtifactShareServingLock)(
      this.deps.home,
      (error) => {
        this.log.event(`serving lock compromised: ${error.message}`)
        this.failure = 'Another process took over the share service lock.'
        void this.enqueue(() => this.stopActive())
      }
    )
    if (!release) {
      return
    }
    let server: Server | null = null
    try {
      const config = readArtifactShareConfig(this.deps.home)
      const instance = randomBytes(12).toString('base64url')
      server = createServer(
        createArtifactShareRequestHandler({
          home: this.deps.home,
          instance,
          computerLabel: this.deps.computerLabel,
          viewer: this.deps.viewer,
          log: this.log.request
        })
      )
      server.maxConnections = MAX_CONNECTIONS
      server.requestTimeout = 10_000
      server.headersTimeout = 10_000
      const desired = config.confirmedPort ?? config.preferredPort
      let port: number | null = desired
      if ((await listenOnArtifactSharePort(server, desired)) === 'in-use') {
        if (config.confirmedPort !== null) {
          this.active = { mode: 'port-conflict', release, port: desired }
          writeArtifactShareServingState(this.deps.home, {
            ...this.idleState('port-conflict'),
            port: desired
          })
          this.log.event(`port ${desired} is used by another program`)
          return
        }
        port = await listenOnFallbackArtifactSharePort(server)
      }
      if (port === null) {
        throw new Error('No free port was found for the share service.')
      }
      if (config.confirmedPort !== port) {
        await updateArtifactShareConfig(this.deps.home, { confirmedPort: port })
      }
      const candidates = await (this.deps.listIpCandidates ?? listArtifactShareIpCandidates)()
      const refresh = setInterval(
        () => void this.enqueue(() => this.refreshIp()),
        IP_REFRESH_INTERVAL_MS
      )
      refresh.unref()
      this.active = {
        mode: 'serving',
        server,
        release,
        instance,
        port,
        candidates,
        ip: chooseArtifactShareIp(candidates, config.ip),
        ipChoice: config.ip,
        refresh
      }
      this.writeServing()
      this.log.event(`serving on port ${port}`)
    } catch (error) {
      // Why: a failure after listen (config write, IP lookup) must not leave an untracked listener.
      server?.close()
      this.failure = error instanceof Error ? error.message : String(error)
      writeArtifactShareServingState(this.deps.home, {
        ...this.idleState('failed'),
        reason: this.failure
      })
      this.log.event(`failed to start: ${this.failure}`)
      await release()
    }
  }

  private async refreshIp(): Promise<void> {
    if (this.active?.mode !== 'serving') {
      return
    }
    const candidates = await (this.deps.listIpCandidates ?? listArtifactShareIpCandidates)()
    const ipChoice = readArtifactShareConfig(this.deps.home).ip
    this.active.candidates = candidates
    this.active.ipChoice = ipChoice
    this.active.ip = chooseArtifactShareIp(candidates, ipChoice)
    this.writeServing()
  }

  private writeServing(): void {
    if (this.active?.mode !== 'serving') {
      return
    }
    writeArtifactShareServingState(this.deps.home, {
      state: 'serving',
      pid: process.pid,
      instance: this.active.instance,
      port: this.active.port,
      ip: this.active.ip,
      ipCandidates: this.active.candidates,
      reason: null
    })
  }

  private idleState(state: 'sharing-off' | 'port-conflict' | 'failed' | 'stopped') {
    return {
      state,
      pid: process.pid,
      instance: null,
      port: null,
      ip: null,
      ipCandidates: [],
      reason: null
    }
  }

  private async stopActive(): Promise<void> {
    const active = this.active
    if (!active) {
      return
    }
    this.active = null
    if (active.mode === 'serving') {
      clearInterval(active.refresh)
      await new Promise<void>((resolve) => {
        active.server.close(() => resolve())
        active.server.closeAllConnections()
      })
    }
    writeArtifactShareServingState(this.deps.home, this.idleState('stopped'))
    await active.release().catch(() => {})
    this.log.event('stopped')
  }
}
