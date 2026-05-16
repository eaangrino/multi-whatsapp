import { app, BrowserWindow, ipcMain, BrowserView, Rectangle, Menu, Tray, nativeImage, shell, Notification, IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs';
import path from 'node:path';
// import started from 'electron-squirrel-startup';


const stateFilePath = path.join(app.getPath('userData'), 'wa-sessions.json');
const settingsFilePath = path.join(app.getPath('userData'), 'app-settings.json');
const linuxAutostartDir = path.join(app.getPath('appData'), 'autostart');
const linuxAutostartPath = path.join(linuxAutostartDir, 'multi-whatsapp.desktop');

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env[ 'VITE_DEV_SERVER_URL' ]
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const PUBLIC_DIST = path.join(process.env.APP_ROOT, 'public')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const trayIconPath = path.join(PUBLIC_DIST, 'whatsapp.png');

type AppSettings = {
  isSidebarCompact: boolean
  notificationDurationMs: number
}

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

const WHATSAPP_PROTOCOL = 'whatsapp'

// if (started) {
//   app.quit();
// }

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false
const viewsMap: Map<number, BrowserView> = new Map();
let sessionOrder: WhatsAppSession[] = [];
let currentViewId: number | null = null;
let isActiveViewAttached = false;
let appSettings: AppSettings = {
  isSidebarCompact: false,
  notificationDurationMs: 5000,
};
let pendingWhatsAppLinkRequest: WhatsAppLinkRequest | null = null
const DEFAULT_SIDEBAR_WIDTH = 120;
let sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
const MIN_VIEW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 500;

const DEFAULT_SESSION_NAME_PREFIX = 'name';

const isValidSessionId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id > 0;

const getLegacySessionName = (index: number) =>
  `${DEFAULT_SESSION_NAME_PREFIX} ${index + 1}`;

const normalizeSessionName = (name: unknown, fallback: string) => {
  if (typeof name !== 'string') {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 50) : fallback;
};

const isSessionLike = (value: unknown): value is { id: number; name?: unknown } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return isValidSessionId((value as { id?: unknown }).id);
};

const uniqueSessionsById = (sessions: WhatsAppSession[]) => {
  const seen = new Set<number>();

  return sessions.filter((session) => {
    if (seen.has(session.id)) {
      return false;
    }

    seen.add(session.id);
    return true;
  });
};

const migrateLegacyIds = (ids: unknown): WhatsAppSession[] => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return uniqueSessionsById(
    ids
      .filter(isValidSessionId)
      .map((id, index) => ({
        id,
        name: getLegacySessionName(index),
      })),
  );
};

const normalizeSessions = (sessions: unknown): WhatsAppSession[] => {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return uniqueSessionsById(
    sessions
      .filter(isSessionLike)
      .map((session, index) => ({
        id: session.id,
        name: normalizeSessionName(session.name, getLegacySessionName(index)),
      })),
  );
};

const saveSessionState = () => {
  fs.writeFileSync(stateFilePath, JSON.stringify({ sessions: sessionOrder }));
};

const loadSessionState = (): WhatsAppSession[] => {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf-8');
      const parsed = JSON.parse(data) as unknown;

      if (Array.isArray(parsed)) {
        return migrateLegacyIds(parsed);
      }

      if (typeof parsed === 'object' && parsed !== null) {
        const payload = parsed as { ids?: unknown; sessions?: unknown };

        if (Array.isArray(payload.sessions)) {
          return normalizeSessions(payload.sessions);
        }

        if (Array.isArray(payload.ids)) {
          return migrateLegacyIds(payload.ids);
        }
      }
    }
  } catch (err) {
    console.error('Error loading session state:', err);
  }

  return [];
};

const loadAppSettings = (): AppSettings => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;

      return {
        isSidebarCompact:
          typeof parsed.isSidebarCompact === 'boolean'
            ? parsed.isSidebarCompact
            : false,
        notificationDurationMs:
          typeof parsed.notificationDurationMs === 'number'
            ? Math.max(1000, parsed.notificationDurationMs)
            : 5000,
      };
    }
  } catch (err) {
    console.error('Error loading app settings:', err);
  }

  return {
    isSidebarCompact: false,
    notificationDurationMs: 5000,
  };
};

const saveAppSettings = () => {
  fs.writeFileSync(settingsFilePath, JSON.stringify(appSettings));
};

const setSessionOrder = (sessions: WhatsAppSession[]) => {
  const validSessions = uniqueSessionsById(
    sessions
      .filter((session) => viewsMap.has(session.id))
      .map((session, index) => ({
        id: session.id,
        name: normalizeSessionName(session.name, getLegacySessionName(index)),
      })),
  );

  const missingSessions = sessionOrder.filter(
    (session) =>
      !validSessions.some((validSession) => validSession.id === session.id) &&
      viewsMap.has(session.id),
  );

  sessionOrder = [ ...validSessions, ...missingSessions ];
  saveSessionState();
};

const getViewBounds = (window: BrowserWindow): Rectangle => {
  const [ contentWidth, contentHeight ] = window.getContentSize();
  const width = Math.max(contentWidth - sidebarWidth, MIN_VIEW_WIDTH);

  return {
    x: sidebarWidth,
    y: 0,
    width,
    height: contentHeight,
  };
};

const resizeActiveView = () => {
  if (!win || currentViewId === null) return;

  const view = viewsMap.get(currentViewId);
  if (!view) return;

  view.setBounds(getViewBounds(win));
};

const resizeActiveViewDeferred = () => {
  setImmediate(() => {
    resizeActiveView();
  });
};

const getAppIconPath = () => {
  if (fs.existsSync(trayIconPath)) {
    return trayIconPath;
  }

  return path.join(PUBLIC_DIST, 'WhatsApp.svg');
};

const createTrayIcon = () => {
  const icon = nativeImage.createFromPath(getAppIconPath());

  if (process.platform === 'linux' && !icon.isEmpty()) {
    return icon.resize({ width: 22, height: 22 });
  }

  return icon;
};

const bindResizeEvents = () => {
  if (!win) return;

  win.on('resize', resizeActiveViewDeferred);
  win.on('maximize', resizeActiveViewDeferred);
  win.on('unmaximize', resizeActiveViewDeferred);
  win.on('restore', resizeActiveViewDeferred);
  win.on('enter-full-screen', resizeActiveViewDeferred);
  win.on('leave-full-screen', resizeActiveViewDeferred);
  win.on('show', resizeActiveViewDeferred);
};

const showMainWindow = () => {
  if (!win) {
    createWindow();
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  win.focus();
  resizeActiveViewDeferred();
};

const showDesktopNotification = ({ title, body, silent }: NotificationPayload) => {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title,
    body,
    silent,
    icon: getAppIconPath(),
  });

  notification.show();
  setTimeout(() => {
    notification.close();
  }, appSettings.notificationDurationMs);
};

const createTray = () => {
  if (tray) {
    return tray;
  }

  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('Multi-WhatsApp');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Multi-WhatsApp',
        click: () => showMainWindow(),
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          tray?.destroy();
          tray = null;
          win?.destroy();
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => {
    if (!win) {
      createWindow();
      return;
    }

    if (win.isVisible()) {
      win.hide();
      return;
    }

    showMainWindow();
  });

  return tray;
};

const normalizeWhatsAppTargetUrl = (rawUrl: string): WhatsAppLinkRequest | null => {
  const value = rawUrl.trim()

  if (value.length === 0) {
    return null
  }

  const urlWithProtocol = value.startsWith('wa.me/')
    ? `https://${value}`
    : value

  try {
    const parsedUrl = new URL(urlWithProtocol)
    const outputUrl = new URL('https://web.whatsapp.com/send')

    if (parsedUrl.protocol === 'whatsapp:' && parsedUrl.hostname === 'send') {
      const phone = parsedUrl.searchParams.get('phone')
      const text = parsedUrl.searchParams.get('text')

      if (phone) {
        outputUrl.searchParams.set('phone', phone)
      }

      if (text) {
        outputUrl.searchParams.set('text', text)
      }

      return {
        displayUrl: rawUrl,
        url: outputUrl.toString(),
      }
    }

    if (parsedUrl.protocol !== 'https:') {
      return null
    }

    if (parsedUrl.hostname === 'wa.me') {
      const phone = parsedUrl.pathname.replace('/', '').trim()
      const text = parsedUrl.searchParams.get('text')

      if (phone.length > 0) {
        outputUrl.searchParams.set('phone', phone)
      }

      if (text) {
        outputUrl.searchParams.set('text', text)
      }

      return {
        displayUrl: rawUrl,
        url: outputUrl.toString(),
      }
    }

    if (
      parsedUrl.hostname === 'api.whatsapp.com' &&
      parsedUrl.pathname.startsWith('/send')
    ) {
      const phone = parsedUrl.searchParams.get('phone')
      const text = parsedUrl.searchParams.get('text')

      if (phone) {
        outputUrl.searchParams.set('phone', phone)
      }

      if (text) {
        outputUrl.searchParams.set('text', text)
      }

      return {
        displayUrl: rawUrl,
        url: outputUrl.toString(),
      }
    }

    if (
      parsedUrl.hostname === 'web.whatsapp.com' &&
      parsedUrl.pathname.startsWith('/send')
    ) {
      return {
        displayUrl: rawUrl,
        url: parsedUrl.toString(),
      }
    }
  } catch {
    return null
  }

  return null
}

const getWhatsAppLinkRequestFromArgv = (argv: string[]) => {
  for (const arg of argv) {
    const request = normalizeWhatsAppTargetUrl(arg)

    if (request) {
      return request
    }
  }

  return null
}

const sendWhatsAppLinkRequestToRenderer = (request: WhatsAppLinkRequest) => {
  pendingWhatsAppLinkRequest = request
  showMainWindow()
  win?.webContents.send('whatsapp-link-requested', request)
}

const registerWhatsAppProtocol = () => {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(WHATSAPP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[ 1 ]),
    ])
    return
  }

  app.setAsDefaultProtocolClient(WHATSAPP_PROTOCOL)
}

registerWhatsAppProtocol()

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (_event, argv) => {
  const request = getWhatsAppLinkRequestFromArgv(argv)

  if (request) {
    sendWhatsAppLinkRequestToRenderer(request)
    return
  }

  showMainWindow()
});

app.on('open-url', (event, targetUrl) => {
  event.preventDefault()

  const request = normalizeWhatsAppTargetUrl(targetUrl)

  if (request) {
    sendWhatsAppLinkRequestToRenderer(request)
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: DEFAULT_SIDEBAR_WIDTH + MIN_VIEW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }


  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  bindResizeEvents();

  win.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    win?.hide();
  });

  win.on('closed', () => {
    win = null;
  });
}

const createOrGetWhatsAppView = (id: number): BrowserView => {
  const existingView = viewsMap.get(id);
  if (existingView) {
    return existingView;
  }

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: `persist:WhatsApp_${id}`,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  const chromeUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  view.webContents.setUserAgent(chromeUserAgent);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalWhatsAppUrl(url)) {
      openExternalUrl(url);
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });
  view.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isInternalWhatsAppUrl(targetUrl)) {
      event.preventDefault();
      openExternalUrl(targetUrl);
    }
  });

  if (win) {
    view.setBounds(getViewBounds(win));
  }
  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL('https://web.whatsapp.com');

  viewsMap.set(id, view);
  if (!sessionOrder.some((session) => session.id === id)) {
    sessionOrder = [
      ...sessionOrder,
      {
        id,
        name: getLegacySessionName(sessionOrder.length),
      },
    ];
  }
  saveSessionState();// Guarda en disco la lista actual
  return view;
};

const clearSessionData = async (id: number, view: BrowserView) => {
  const partitionSession = view.webContents.session;

  try {
    await partitionSession.clearStorageData();
    await partitionSession.clearCache();
    await partitionSession.clearAuthCache();
  } catch (err) {
    console.error(`Error clearing session data for WhatsApp_${id}:`, err);
  }
};

const detachActiveView = () => {
  if (!win || currentViewId === null || !isActiveViewAttached) {
    return;
  }

  const activeView = viewsMap.get(currentViewId);
  if (!activeView) {
    return;
  }

  win.removeBrowserView(activeView);
  isActiveViewAttached = false;
};

const attachActiveView = () => {
  if (!win || currentViewId === null || isActiveViewAttached) {
    return;
  }

  const activeView = viewsMap.get(currentViewId);
  if (!activeView) {
    return;
  }

  win.addBrowserView(activeView);
  isActiveViewAttached = true;
  resizeActiveView();
};

const setActiveViewVisible = (isVisible: boolean) => {
  if (isVisible) {
    attachActiveView();
    return;
  }

  detachActiveView();
};

const escapeDesktopEntryValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getLinuxAutostartDesktopEntry = () => {
  const executablePath = escapeDesktopEntryValue(process.execPath);
  const iconPath = escapeDesktopEntryValue(getAppIconPath());

  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Multi-WhatsApp',
    'Comment=Desktop app to manage multiple WhatsApp sessions',
    `Exec="${executablePath}"`,
    `Icon=${iconPath}`,
    'Terminal=false',
    'StartupNotify=false',
    'Categories=Network;Chat;',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
};

const isLinuxAutostartEnabled = () => fs.existsSync(linuxAutostartPath);

const setLinuxAutostart = (enabled: boolean) => {
  if (enabled) {
    fs.mkdirSync(linuxAutostartDir, { recursive: true });
    fs.writeFileSync(linuxAutostartPath, getLinuxAutostartDesktopEntry(), 'utf-8');
    return true;
  }

  if (fs.existsSync(linuxAutostartPath)) {
    fs.unlinkSync(linuxAutostartPath);
  }

  return false;
};

const getStartOnLogin = () => {
  if (process.platform === 'linux') {
    return isLinuxAutostartEnabled();
  }

  return app.getLoginItemSettings().openAtLogin;
};

const setStartOnLogin = (enabled: boolean) => {
  if (process.platform === 'linux') {
    return setLinuxAutostart(enabled);
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
  });

  return getStartOnLogin();
};

const getNotificationDuration = () => Math.round(appSettings.notificationDurationMs / 1000);

const setNotificationDuration = (seconds: number) => {
  appSettings = {
    ...appSettings,
    notificationDurationMs: Math.max(1, Math.floor(seconds)) * 1000,
  };
  saveAppSettings();
  return getNotificationDuration();
};

const getSidebarCompact = () => appSettings.isSidebarCompact;

const setSidebarCompact = (isCompact: boolean) => {
  appSettings = {
    ...appSettings,
    isSidebarCompact: isCompact,
  };
  saveAppSettings();
  return appSettings.isSidebarCompact;
};

const setSidebarWidth = (nextWidth: number) => {
  sidebarWidth = Math.max(56, Math.floor(nextWidth));
  resizeActiveViewDeferred();
};

const isInternalWhatsAppUrl = (targetUrl: string) => {
  try {
    const parsedUrl = new URL(targetUrl);
    return (
      parsedUrl.protocol === 'https:' &&
      (parsedUrl.hostname === 'whatsapp.com' ||
        parsedUrl.hostname.endsWith('.whatsapp.com'))
    );
  } catch {
    return false;
  }
};

const openExternalUrl = (targetUrl: string) => {
  void shell.openExternal(targetUrl);
};

// 👉 Cambia la vista activa
const switchToWhatsAppView = (id: number) => {
  const view = createOrGetWhatsAppView(id);

  detachActiveView();

  win!.addBrowserView(view);
  currentViewId = id;
  isActiveViewAttached = true;

  resizeActiveView(); // 👈 aquí fuerzas el ajuste inmediato
};


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (win) {
    showMainWindow();
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  appSettings = loadAppSettings();
  createWindow();
  createTray();

  const savedSessions = loadSessionState();
  sessionOrder = [ ...savedSessions ];
  savedSessions.forEach(({ id }) => {
    createOrGetWhatsAppView(id);
  });

  if (savedSessions.length > 0) {
    switchToWhatsAppView(savedSessions[ 0 ].id);
  }

  const startupWhatsAppLinkRequest = getWhatsAppLinkRequestFromArgv(process.argv)

  if (startupWhatsAppLinkRequest) {
    pendingWhatsAppLinkRequest = startupWhatsAppLinkRequest
  }

  ipcMain.handle('open-WhatsApp', (_event, id: number) => {
    if (!isValidSessionId(id)) {
      return;
    }

    switchToWhatsAppView(id);
  });

  ipcMain.handle('close-WhatsApp', async (_event, id: number) => {
    if (!isValidSessionId(id)) {
      return;
    }

    const view = viewsMap.get(id);
    if (view) {
      if (currentViewId === id) {
        detachActiveView();
        currentViewId = null;
      }

      await clearSessionData(id, view);
      view.webContents.close();
      viewsMap.delete(id);
      sessionOrder = sessionOrder.filter((session) => session.id !== id);
      saveSessionState();
    }
  });

  ipcMain.handle('reorder-sessions', (_event, sessions: WhatsAppSession[]) => {
    setSessionOrder(normalizeSessions(sessions));
    return sessionOrder;
  });

  ipcMain.handle('get-sessions', () => {
    return sessionOrder;
  });

  ipcMain.handle('set-active-view-visible', (_event, isVisible: boolean) => {
    if (typeof isVisible !== 'boolean') {
      return;
    }

    setActiveViewVisible(isVisible);
  });

  ipcMain.handle('get-start-on-login', () => {
    return getStartOnLogin();
  });

  ipcMain.handle('set-start-on-login', (_event, enabled: boolean) => {
    return setStartOnLogin(enabled);
  });

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

  ipcMain.handle('get-notification-duration', () => {
    return getNotificationDuration();
  });

  ipcMain.handle('set-notification-duration', (_event, seconds: number) => {
    return setNotificationDuration(seconds);
  });

  ipcMain.handle('get-sidebar-compact', () => {
    return getSidebarCompact();
  });

  ipcMain.handle('set-sidebar-compact', (_event, isCompact: boolean) => {
    if (typeof isCompact !== 'boolean') {
      return getSidebarCompact();
    }

    return setSidebarCompact(isCompact);
  });

  ipcMain.handle('set-sidebar-width', (_event, nextWidth: number) => {
    setSidebarWidth(nextWidth);
  });

  ipcMain.handle('get-pending-whatsapp-link-request', () => {
    return pendingWhatsAppLinkRequest
  })

  ipcMain.handle('clear-pending-whatsapp-link-request', () => {
    pendingWhatsAppLinkRequest = null
  })

  ipcMain.handle(
    'open-whatsapp-link-in-session',
    (_event: IpcMainInvokeEvent, sessionId: number, targetUrl: string) => {
      if (!isValidSessionId(sessionId) || typeof targetUrl !== 'string') {
        return false
      }

      const request = normalizeWhatsAppTargetUrl(targetUrl)

      if (!request) {
        return false
      }

      const sessionExists = sessionOrder.some((session) => session.id === sessionId)

      if (!sessionExists) {
        return false
      }

      switchToWhatsAppView(sessionId)

      const view = viewsMap.get(sessionId)

      if (!view) {
        return false
      }

      void view.webContents.loadURL(request.url)
      pendingWhatsAppLinkRequest = null

      return true
    },
  )

  ipcMain.on('whatsapp-notification', (_event, payload: NotificationPayload) => {
    showDesktopNotification(payload);
  });


});
