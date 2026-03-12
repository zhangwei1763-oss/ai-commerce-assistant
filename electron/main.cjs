const { app, BrowserWindow, dialog, protocol, net, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_PROTOCOL = 'app';
const APP_HOST = 'local';

let mainWindow = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: false,
    },
  },
]);

function resolveDistDir() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'dist')
    : path.join(__dirname, '..', 'dist');
}

function resolveDesktopConfigCandidates() {
  const candidates = [];
  if (process.env.ELECTRON_API_BASE_URL) {
    return [];
  }

  if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    candidates.push(path.join(exeDir, 'desktop.config.json'));
    candidates.push(path.join(process.resourcesPath, 'desktop.config.json'));
  } else {
    const projectRoot = path.join(__dirname, '..');
    candidates.push(path.join(projectRoot, 'desktop.config.json'));
  }

  return candidates;
}

function loadDesktopConfig() {
  if (process.env.ELECTRON_API_BASE_URL) {
    return {
      apiBaseUrl: process.env.ELECTRON_API_BASE_URL.trim(),
    };
  }

  for (const candidate of resolveDesktopConfigCandidates()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed?.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()) {
        return {
          apiBaseUrl: parsed.apiBaseUrl.trim(),
        };
      }
    } catch (error) {
      throw new Error(`桌面配置文件读取失败: ${candidate}`);
    }
  }

  throw new Error('未找到桌面配置文件 desktop.config.json，请先配置远程 API 地址。');
}

function registerAppProtocol() {
  const distDir = resolveDistDir();

  protocol.handle(APP_PROTOCOL, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST) {
      return new Response('Not Found', { status: 404 });
    }

    const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const sanitizedPath = relativePath.replace(/^\/+/, '');
    let targetPath = path.join(distDir, sanitizedPath);

    if (!targetPath.startsWith(distDir)) {
      targetPath = path.join(distDir, 'index.html');
    }

    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(distDir, 'index.html');
    }

    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

async function createWindow() {
  const desktopConfig = loadDesktopConfig();
  process.env.ELECTRON_API_BASE_URL = desktopConfig.apiBaseUrl;
  process.env.ELECTRON_APP_MODE = 'desktop-remote';

  const preloadPath = path.join(__dirname, 'preload.cjs');
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || `${APP_PROTOCOL}://${APP_HOST}/`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  await mainWindow.loadURL(rendererUrl);
}

async function bootstrap() {
  try {
    registerAppProtocol();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('启动失败', error instanceof Error ? error.message : '应用启动失败');
    app.quit();
  }
}

app.whenReady().then(async () => {
  await session.defaultSession.clearCache().catch(() => undefined);
  await bootstrap();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
