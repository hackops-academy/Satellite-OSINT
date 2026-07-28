const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('astralBridge', {
  isElectron: true,
  saveJsonFile: (defaultName, content) =>
    ipcRenderer.invoke('save-json-file', { defaultName, content }),
  openJsonFile: () =>
    ipcRenderer.invoke('open-json-file'),
  revealInFolder: (targetPath) =>
    ipcRenderer.invoke('reveal-in-folder', { targetPath }),
  reverseGeocode: (lat, lon) =>
    ipcRenderer.invoke('nominatim-reverse', { lat, lon }),
  searchPlaces: (query) =>
    ipcRenderer.invoke('nominatim-search', { query }),
});
