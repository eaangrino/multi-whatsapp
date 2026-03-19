import { app, BrowserWindow, ipcMain, BrowserView, Rectangle, Menu, Tray, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs';
import path from 'node:path';
// import started from 'electron-squirrel-startup';


const stateFilePath = path.join(app.getPath('userData'), 'wa-sessions.json');

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


// if (started) {
//   app.quit();
// }

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false
const viewsMap: Map<number, BrowserView> = new Map();
let currentViewId: number | null = null;
const SIDEBAR_WIDTH = 120;
const MIN_VIEW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 500;

const saveSessionState = () => {
  const ids = Array.from(viewsMap.keys());
  fs.writeFileSync(stateFilePath, JSON.stringify({ ids }));
};

const loadSessionState = (): number[] => {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.ids)) {
        return parsed.ids;
      }
    }
  } catch (err) {
    console.error('Error loading session state:', err);
  }
  return [];
};

const getViewBounds = (window: BrowserWindow): Rectangle => {
  const [contentWidth, contentHeight] = window.getContentSize();
  const width = Math.max(contentWidth - SIDEBAR_WIDTH, MIN_VIEW_WIDTH);

  return {
    x: SIDEBAR_WIDTH,
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


function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: SIDEBAR_WIDTH + MIN_VIEW_WIDTH,
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
    },
  });

  const chromeUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  view.webContents.setUserAgent(chromeUserAgent);

  if (win) {
    view.setBounds(getViewBounds(win));
  }
  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL('https://web.whatsapp.com');

  viewsMap.set(id, view);
  saveSessionState(); // Guarda en disco la lista actual
  return view;
};

// 👉 Cambia la vista activa
const switchToWhatsAppView = (id: number) => {
  const view = createOrGetWhatsAppView(id);

  if (currentViewId !== null && viewsMap.has(currentViewId)) {
    const oldView = viewsMap.get(currentViewId)!;
    win!.removeBrowserView(oldView);
  }

  win!.addBrowserView(view);
  currentViewId = id;

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
  createWindow();
  createTray();

  const savedIds = loadSessionState();
  savedIds.forEach(id => {
    createOrGetWhatsAppView(id); // Carga y crea la vista, no la muestra aún
  });

  if (savedIds.length > 0) {
    switchToWhatsAppView(savedIds[ 0 ]); // Muestra la primera por defecto
  }

  ipcMain.handle('open-WhatsApp', (_event, id: number) => {
    switchToWhatsAppView(id);
  });

  ipcMain.handle('close-WhatsApp', (_event, id: number) => {
    const view = viewsMap.get(id);
    if (view) {
      if (currentViewId === id && win) {
        win.removeBrowserView(view);
        currentViewId = null;
      }
      view.webContents.close();
      viewsMap.delete(id);
      saveSessionState(); // Actualiza el archivo al eliminar
    }
  });

  ipcMain.handle('get-sessions', () => {
    try {
      if (fs.existsSync(stateFilePath)) {
        const data = fs.readFileSync(stateFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed.ids)) {
          return parsed.ids;
        }
      }
    } catch (err) {
      console.error('Error reading sessions:', err);
    }
    return [];
  });


});
