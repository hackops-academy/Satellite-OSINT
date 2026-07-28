const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#05080c',
    title: 'AstralOSINT // GEOINT Console',
    icon: path.join(__dirname, 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

// Native "Save Intel As..." dialog + write, replacing the browser
// blob-download approach so exports land wherever the user actually
// wants them, not silently in ~/Downloads.
ipcMain.handle('save-json-file', async (event, { defaultName, content }) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Intel Log',
    defaultPath: defaultName || 'astralosint-intel.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Native "Import Intel..." dialog + read, replacing the hidden
// <input type=file> approach.
ipcMain.handle('open-json-file', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Intel Log',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { ok: true, path: result.filePaths[0], content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Reveal an exported file in the OS file manager.
ipcMain.handle('reveal-in-folder', async (event, { targetPath }) => {
  try {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --- Nominatim geocoding, proxied through the main process --------------
// Nominatim's usage policy requires a real identifying User-Agent or
// Referer on every request. Browsers (and Electron's renderer) refuse to
// let JS set a custom User-Agent header via fetch() - it's on the
// forbidden-header list - so calls made straight from the page are
// frequently throttled or come back empty ("Unknown location" no matter
// where you click). Running the request from here, where we control the
// real HTTP headers, fixes that.
const NOMINATIM_UA = 'AstralOSINT/3.0 (HackOps Academy; desktop app; https://github.com/hackops-academy/AstralOSINT)';

ipcMain.handle('nominatim-reverse', async (event, { lat, lon }) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' } },
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('nominatim-search', async (event, { query }) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' } },
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
