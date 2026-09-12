const { app, BrowserWindow, autoUpdater, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const config = require('./probe-config.json')

process.env.ORCA_BACKGROUND_LAUNCH = '1'
app.setActivationPolicy('prohibited')
app.commandLine.appendSwitch('remote-debugging-port', String(config.cdpPort))
app.setPath('userData', path.join(config.output, 'user-data'))
app.setPath('logs', path.join(config.output, 'logs'))
let window
const events = []
function record(kind, detail = {}) {
  const entry = {
    time: new Date().toISOString(),
    kind,
    pid: process.pid,
    version: app.getVersion(),
    ...detail
  }
  events.push(entry)
  fs.appendFileSync(path.join(config.output, 'events.jsonl'), `${JSON.stringify(entry)}\n`)
  window?.webContents.send('events', events)
}
for (const event of [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'update-downloaded'
]) {
  autoUpdater.on(event, () => record(event))
}
autoUpdater.on('error', (error) => record('error', { message: error.message, stack: error.stack }))
ipcMain.handle('state', () => events)
ipcMain.handle('check', () => {
  record('check-invoked')
  autoUpdater.setFeedURL({ url: config.feed })
  autoUpdater.checkForUpdates()
})
ipcMain.handle('install', () => {
  record('quit-and-install-invoked')
  setImmediate(() => autoUpdater.quitAndInstall())
})
ipcMain.handle('quit', () => {
  record('probe-quit')
  setImmediate(() => app.quit())
})
app.whenReady().then(async () => {
  window = new BrowserWindow({
    width: 1100,
    height: 780,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'app-preload.cjs'),
      backgroundThrottling: false
    }
  })
  await window.loadFile(path.join(__dirname, 'app.html'))
  record('ready', {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    isVisible: window.isVisible(),
    executable: process.execPath,
    userData: app.getPath('userData'),
    bundleId: config.bundleId
  })
})
