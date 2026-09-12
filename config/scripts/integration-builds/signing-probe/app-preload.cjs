const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('probe', {
  state: () => ipcRenderer.invoke('state'),
  check: () => ipcRenderer.invoke('check'),
  install: () => ipcRenderer.invoke('install'),
  quit: () => ipcRenderer.invoke('quit'),
  subscribe: (callback) => ipcRenderer.on('events', (_event, events) => callback(events))
})
