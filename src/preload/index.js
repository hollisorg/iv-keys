import { contextBridge, ipcRenderer } from 'electron'

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('keys', {
  view: {
    get: () => ipcRenderer.invoke('view:get'),
    set: (patch) => ipcRenderer.invoke('view:set', patch),
    onChange: on('view:changed')
  },
  type: (payload) => ipcRenderer.invoke('key:text', payload),
  special: (payload) => ipcRenderer.invoke('key:special', payload),
  onPhysicalShift: on('shift:physical'),
  room: {
    status: () => ipcRenderer.invoke('room:status'),
    action: (name) => ipcRenderer.invoke('room:action', name),
    onStatus: on('room:status')
  },
  lock: {
    state: () => ipcRenderer.invoke('lock:state'),
    set: (on) => ipcRenderer.invoke('lock:set', on),
    onState: on('lock:state')
  },
  voice: {
    state: () => ipcRenderer.invoke('voice:state'),
    command: (cmd) => ipcRenderer.invoke('voice:command', cmd),
    onState: on('voice:state')
  },
  screenshot: () => ipcRenderer.invoke('screenshot'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onToast: on('toast'),
  app: {
    update: () => ipcRenderer.invoke('update:state'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdate: on('update:changed')
  },
  // Development-only; the handler isn't registered in packaged builds.
  dev: { typeTest: (opts) => ipcRenderer.invoke('dev:typeTest', opts) }
})
