import { app, BrowserWindow, ipcMain, BrowserView } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs';
import path from 'node:path';
// import started from 'electron-squirrel-startup';


const stateFilePath = path.join(app.getPath('userData'), 'wa-sessions.json');

const require = createRequire(import.meta.url)
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

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST


// if (started) {
//   app.quit();
// }

let win: BrowserWindow | null
const viewsMap: Map<number, BrowserView> = new Map();
let currentViewId: number | null = null;
const SIDEBAR_WIDTH = 120;

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

const resizeActiveView = () => {
  if (!win || currentViewId === null) return;

  const view = viewsMap.get(currentViewId);
  if (!view) return;

  const [ width, height ] = win.getContentSize();

  view.setBounds({
    x: SIDEBAR_WIDTH,
    y: 0,
    width: width - SIDEBAR_WIDTH,
    height,
  });
};

const resizeActiveViewDeferred = () => {
  setImmediate(() => {
    resizeActiveView();
  });
};

const bindResizeEvents = () => {
  if (!win) return;

  win.on('resize', resizeActiveView);
  win.on('maximize', resizeActiveViewDeferred);
  win.on('unmaximize', resizeActiveViewDeferred);
  win.on('restore', resizeActiveViewDeferred);
  win.on('enter-full-screen', resizeActiveViewDeferred);
  win.on('leave-full-screen', resizeActiveViewDeferred);
  win.on('show', resizeActiveViewDeferred);
};


function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'whatsApp.svg'),
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

  // Escuchar cambios de tamaño
  // win!.on('resize', resizeActiveView);
  bindResizeEvents();
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

  // NOTA: Puedes ajustar esto dinámicamente si agregas resize más adelante
  view.setBounds({ x: 200, y: 0, width: 1000, height: 800 });
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
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow();

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
      win!.removeBrowserView(view);
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