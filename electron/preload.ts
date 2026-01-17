import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [ channel, listener ] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [ channel, ...omit ] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [ channel, ...omit ] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [ channel, ...omit ] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('electronAPI', {
  openWhatsApp: (id: number) => ipcRenderer.invoke('open-WhatsApp', id),
  closeWhatsApp: (id: number) => ipcRenderer.invoke('close-WhatsApp', id),
  getSessions: (): Promise<number[]> => ipcRenderer.invoke('get-sessions'), // 👈 IMPORTANTE
});
