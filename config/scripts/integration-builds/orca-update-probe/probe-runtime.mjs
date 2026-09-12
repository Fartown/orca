import { _electron as electron } from 'playwright'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { command, writeJson } from '../signing-probe/probe-command.mjs'
import { assertElectronResolvedIsolatedHome } from '../../../../tests/e2e/helpers/electron-home-isolation.ts'

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
  const log = join(output, `${label}-process.log`)
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (chunk) => appendFileSync(log, chunk))
  }
  const details = await app.evaluate(({ app, BrowserWindow }) => ({
    home: app.getPath('home'),
    version: app.getVersion(),
    pid: process.pid,
    execPath: process.execPath,
    packaged: app.isPackaged,
    visibleWindows: BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length
  }))
  assertElectronResolvedIsolatedHome(details.home, isolation)
  if (!details.packaged || details.visibleWindows) {
    throw new Error('Expected a hidden, packaged Orca process')
  }
  const page = await app.firstWindow({ timeout: 120_000 })
  await page.waitForFunction(
    () => window.api?.updater && window.__store?.getState().workspaceSessionReady,
    null,
    { timeout: 120_000 }
  )
  writeJson(join(output, `${label}-process.json`), details)
  page.on('pageerror', (error) =>
    appendFileSync(join(output, 'renderer-errors.log'), `${label}: ${error.message}\n`)
  )
  return { app, page, details }
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

export async function terminalCommand(page, marker) {
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
  await page.keyboard.type(`printf 'ORCA_%s\\n' '${marker}'`)
  await page.keyboard.press('Enter')
  return waitUntil(
    () =>
      page.evaluate((marker) => {
        const tab = window.__store.getState().activeTabId
        const pane = window.__paneManagers.get(tab)?.getActivePane()
        const text = pane?.serializeAddon?.serialize?.() ?? ''
        return text.includes(`ORCA_${marker}`)
          ? { text: text.slice(-8000), ptyId: pane.container.dataset.ptyId }
          : null
      }, marker),
    `Terminal output ${marker}`,
    60_000
  )
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
