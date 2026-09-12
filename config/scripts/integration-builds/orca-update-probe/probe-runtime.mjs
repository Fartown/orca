import { _electron as electron } from 'playwright'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { command } from '../signing-probe/probe-command.mjs'
import { readyOrca } from './probe-startup.mjs'

export async function waitUntil(operation, label, timeout = 120_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await operation()
      if (result) {
        return result
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${label} timed out: ${lastError?.message ?? 'condition not reached'}`)
}

export async function launchOrca(appPath, isolation, output, label) {
  const env = {
    ...isolation.env,
    CFFIXED_USER_HOME: isolation.isolatedHome,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_E2E_HEADLESS: '1'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: join(appPath, 'Contents', 'MacOS', 'Orca'),
    args: ['--disable-gpu'],
    env,
    timeout: 120_000
  })
  return readyOrca(app, isolation, output, label)
}

export async function snapshot(page, output, name) {
  const screenshot = `screenshots/${name}.png`
  await page.screenshot({ path: join(output, screenshot), timeout: 30_000 })
  writeFileSync(join(output, `${name}-dom.txt`), await page.locator('body').innerText())
  return screenshot
}

export async function createTerminal(page, folderPath) {
  return page.evaluate(async (folderPath) => {
    const store = window.__store
    const group = await window.api.projectGroups.create({
      name: 'Native Update Probe',
      parentPath: folderPath
    })
    store.setState({ projectGroups: [...store.getState().projectGroups, group] })
    const workspace = await store
      .getState()
      .createFolderWorkspace({ projectGroupId: group.id, name: 'Update continuity', folderPath })
    store.getState().setActiveFolderWorkspace(workspace.id)
    const key = `folder:${workspace.id}`
    const tab = store.getState().createTab(key)
    return { workspaceId: workspace.id, tabId: tab.id }
  }, folderPath)
}

export function continuityCommand(value, initialize) {
  if (!/^[a-f0-9]{32}$/.test(value)) {
    throw new Error('Continuity marker must be random hexadecimal data')
  }
  return `${initialize ? `export ORCA_UPDATE_CONTINUITY='${value}'; ` : ''}printf 'ORCA_${initialize ? 'BEFORE' : 'AFTER'}_%s\\n' "$ORCA_UPDATE_CONTINUITY"`
}

export function hasContinuityOutput(text, value, initialize) {
  return text.includes(`ORCA_${initialize ? 'BEFORE' : 'AFTER'}_${value}`)
}

export async function terminalContinuity(page, value, initialize = false) {
  await page.waitForFunction(
    () => {
      const tab = window.__store?.getState().activeTabId
      return Boolean(
        tab && window.__paneManagers?.get(tab)?.getActivePane()?.container.dataset.ptyId
      )
    },
    null,
    { timeout: 60_000 }
  )
  const input = page.locator('.xterm-helper-textarea').last()
  await input.focus()
  await page.keyboard.type(continuityCommand(value, initialize))
  await page.keyboard.press('Enter')
  let observed
  try {
    return await waitUntil(
      async () => {
        observed = await page.evaluate(() => {
          const tab = window.__store.getState().activeTabId
          const pane = window.__paneManagers.get(tab)?.getActivePane()
          const text = pane?.serializeAddon?.serialize?.() ?? ''
          return { text: text.slice(-8000), ptyId: pane?.container.dataset.ptyId }
        })
        return hasContinuityOutput(observed.text, value, initialize) ? observed : null
      },
      'Original shell continuity marker',
      30_000
    )
  } catch (error) {
    error.terminalObservation = observed
    throw error
  }
}

export async function verifyNativeRuntime(appPath, profile, pid) {
  const metadata = await waitUntil(
    () => {
      const state = JSON.parse(readFileSync(join(profile, 'orca-runtime.json'), 'utf8'))
      const socket = state.transports?.find((transport) => transport.kind === 'unix')
      return state.pid === pid && socket && existsSync(socket.endpoint)
        ? { pid: state.pid, startedAt: state.startedAt, transport: socket.kind }
        : null
    },
    'Native B publishes its isolated runtime',
    30_000
  )
  const started = Date.now()
  while (Date.now() - started < 15_000) {
    if (!matchingAppProcesses(appPath).some((entry) => entry.pid === pid)) {
      throw new Error('Native B exited during startup stability observation')
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return { ...metadata, stableForMs: Date.now() - started }
}

export function matchingAppProcesses(appPath) {
  const executable = join(appPath, 'Contents', 'MacOS', 'Orca')
  const lines = command('/bin/ps', ['-axo', 'pid=,command=']).stdout.split('\n')
  return lines.flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line)
    return match && (match[2] === executable || match[2].startsWith(`${executable} `))
      ? [{ pid: Number(match[1]), command: match[2] }]
      : []
  })
}

export async function stopOwnedProcesses(scratch) {
  const processes = command('/bin/ps', ['-axo', 'pid=,command='])
    .stdout.split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(.+)$/.exec(line)
      return match && match[2].includes(`${scratch}/`) && Number(match[1]) !== process.pid
        ? [Number(match[1])]
        : []
    })
  for (const pid of processes) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* The native installer can exit between inventory and cleanup. */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return processes
}
