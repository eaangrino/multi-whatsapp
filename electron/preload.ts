import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron'

type NotificationPayload = {
  body?: string
  silent?: boolean
  title: string
}

type WhatsAppSession = {
  id: number
  name: string
}

type WhatsAppLinkRequest = {
  displayUrl: string
  url: string
}

type WhatsAppLinkRequestHandler = (request: WhatsAppLinkRequest) => void

const isWhatsAppContext = window.location.hostname.endsWith('whatsapp.com')

if (isWhatsAppContext) {
  class NotificationShim extends EventTarget {
    static permission: NotificationPermission = 'granted'

    static requestPermission(): Promise<NotificationPermission> {
      return Promise.resolve('granted')
    }

    constructor(title: string, options?: NotificationOptions) {
      super()

      const payload: NotificationPayload = {
        title,
        body: options?.body,
        silent: options?.silent ?? undefined,
      }

      ipcRenderer.send('whatsapp-notification', payload)
      queueMicrotask(() => this.dispatchEvent(new Event('show')))
    }

    close(): void {
      this.dispatchEvent(new Event('close'))
    }
  }

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: NotificationShim,
  })
}

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
  openWhatsApp: (id: number): Promise<void> => ipcRenderer.invoke('open-WhatsApp', id),
  closeWhatsApp: (id: number) => ipcRenderer.invoke('close-WhatsApp', id),
  getSessions: (): Promise<WhatsAppSession[]> => ipcRenderer.invoke('get-sessions'), // 👈 IMPORTANTE
  reorderSessions: (sessions: WhatsAppSession[]): Promise<WhatsAppSession[]> =>
    ipcRenderer.invoke('reorder-sessions', sessions),
  setActiveViewVisible: (isVisible: boolean): Promise<void> => ipcRenderer.invoke('set-active-view-visible', isVisible),
  getStartOnLogin: (): Promise<boolean> => ipcRenderer.invoke('get-start-on-login'),
  setStartOnLogin: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('set-start-on-login', enabled),
  getSidebarCompact: (): Promise<boolean> => ipcRenderer.invoke('get-sidebar-compact'),
  setSidebarCompact: (isCompact: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-sidebar-compact', isCompact),
  setSidebarWidth: (width: number): Promise<void> => ipcRenderer.invoke('set-sidebar-width', width),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('get-platform'),
  getNotificationDuration: (): Promise<number> => ipcRenderer.invoke('get-notification-duration'),
  setNotificationDuration: (seconds: number): Promise<number> => ipcRenderer.invoke('set-notification-duration', seconds),
  getPendingWhatsAppLinkRequest: (): Promise<WhatsAppLinkRequest | null> =>
    ipcRenderer.invoke('get-pending-whatsapp-link-request'),
  clearPendingWhatsAppLinkRequest: (): Promise<void> =>
    ipcRenderer.invoke('clear-pending-whatsapp-link-request'),
  openWhatsAppLinkInSession: (
    sessionId: number,
    targetUrl: string,
  ): Promise<boolean> =>
    ipcRenderer.invoke('open-whatsapp-link-in-session', sessionId, targetUrl),
  onWhatsAppLinkRequested: (handler: WhatsAppLinkRequestHandler): (() => void) => {
    const listener = (_event: IpcRendererEvent, request: WhatsAppLinkRequest) => {
      handler(request)
    }

    ipcRenderer.on('whatsapp-link-requested', listener)

    return () => {
      ipcRenderer.off('whatsapp-link-requested', listener)
    }
  },
});
