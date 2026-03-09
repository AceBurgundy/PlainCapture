const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  saveFile: (buffer, totalTime) => ipcRenderer.invoke("save-file", { buffer, totalTime }),
  sources: () => ipcRenderer.invoke("sources")
});
