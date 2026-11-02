const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('misakiDesktop', {
  backend: (path, method, body) => ipcRenderer.invoke('misaki:backend', { path, method, body }),
  action: action => ipcRenderer.invoke('misaki:action', action),
  setAlwaysOnTop: value => ipcRenderer.invoke('misaki:top', value),
  reportInterface: state => ipcRenderer.invoke('misaki:interface', state),
});
