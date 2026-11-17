const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('misakiDesktop', {
  backend: (path, method, body) => ipcRenderer.invoke('misaki:backend', { path, method, body }),
  action: action => ipcRenderer.invoke('misaki:action', action),
  permissions: () => ipcRenderer.invoke('misaki:permissions'),
  setPermission: value => ipcRenderer.invoke('misaki:permission-set', value),
  chooseGrant: kind => ipcRenderer.invoke('misaki:grant-choose', kind),
  revokeGrant: value => ipcRenderer.invoke('misaki:grant-revoke', value),
  mediaStatus: () => ipcRenderer.invoke('misaki:media-status'),
  chooseMusicLibrary: () => ipcRenderer.invoke('misaki:media-library'),
  searchMedia: query => ipcRenderer.invoke('misaki:media-search', query),
  desktopContext: query => ipcRenderer.invoke('misaki:desktop-context', query),
  screenSources: () => ipcRenderer.invoke('misaki:screen-sources'),
  captureScreen: id => ipcRenderer.invoke('misaki:screen-capture', id),
  stopSharing: () => ipcRenderer.invoke('misaki:screen-stop'),
  setAlwaysOnTop: value => ipcRenderer.invoke('misaki:top', value),
  reportInterface: state => ipcRenderer.invoke('misaki:interface', state),
});
