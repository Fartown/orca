import { createStore } from 'zustand/vanilla'
import type { IntegrationRelease } from '../../../src/shared/integration-builds/release-catalog'

export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'permission'
  | 'installing'
  | 'installer-opened'
  | 'error'

export interface UpdateState {
  stage: UpdateStage
  release: IntegrationRelease | null
  progress: number
  error: string | null
}

export interface UpdatePorts {
  versionCode(): number
  latest(): Promise<IntegrationRelease>
  download(release: IntegrationRelease, progress: (percent: number) => void): Promise<void>
  verify(release: IntegrationRelease): Promise<void>
  canInstall(): boolean
  requestPermission(): Promise<void>
  install(): Promise<void>
}

const busy = (stage: UpdateStage) =>
  ['checking', 'downloading', 'verifying', 'installing'].includes(stage)

export function createUpdateController(ports: UpdatePorts) {
  const store = createStore<UpdateState>(() => ({
    stage: 'idle',
    release: null,
    progress: 0,
    error: null
  }))
  let lastCheck = 0
  let downloaded = false
  const fail = (error: unknown) =>
    store.setState({
      stage: 'error',
      error: String(error instanceof Error ? error.message : error)
    })

  async function check(manual = false) {
    const { stage } = store.getState()
    if (busy(stage) || ['ready', 'permission', 'installer-opened'].includes(stage)) {
      return
    }
    if (!manual && Date.now() - lastCheck < 24 * 60 * 60 * 1000) {
      return
    }
    store.setState({ stage: 'checking', error: null, release: null })
    try {
      const release = await ports.latest()
      lastCheck = Date.now()
      downloaded = false
      store.setState({
        release,
        stage: release.androidVersionCode > ports.versionCode() ? 'available' : 'latest'
      })
    } catch (error) {
      lastCheck = Date.now() - 24 * 60 * 60 * 1000 + 5 * 60 * 1000
      fail(error)
    }
  }

  async function install() {
    if (busy(store.getState().stage) || !downloaded) {
      return
    }
    const release = store.getState().release
    if (!release) {
      return
    }
    store.setState({ stage: 'installing', error: null })
    try {
      if (!ports.canInstall()) {
        await ports.requestPermission()
        store.setState({ stage: 'permission' })
        return
      }
      await ports.verify(release)
      await ports.install()
      store.setState({ stage: 'installer-opened' })
    } catch (error) {
      fail(error)
    }
  }

  async function download() {
    const { stage, release } = store.getState()
    if (busy(stage) || !release || release.androidVersionCode <= ports.versionCode()) {
      return
    }
    downloaded = false
    store.setState({ stage: 'downloading', progress: 0, error: null })
    try {
      await ports.download(release, (progress) =>
        store.setState({ progress: Math.max(0, Math.min(100, progress)) })
      )
      store.setState({ stage: 'verifying' })
      await ports.verify(release)
      downloaded = true
      store.setState({ stage: 'ready' })
    } catch (error) {
      fail(error)
    }
  }

  function resume() {
    const { stage } = store.getState()
    if (stage === 'installer-opened' || (stage === 'permission' && ports.canInstall())) {
      store.setState({ stage: 'ready' })
    }
  }

  return { store, check, download, install, resume }
}
