const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopConfig', {
  apiBaseUrl: process.env.ELECTRON_API_BASE_URL || '',
  mode: process.env.ELECTRON_APP_MODE || 'desktop-remote',
});
