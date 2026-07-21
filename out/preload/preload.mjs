import { contextBridge, ipcRenderer } from "electron";
const api = {
  keys: {
    list: () => ipcRenderer.invoke("keys:list"),
    get: (provider) => ipcRenderer.invoke("keys:get", provider),
    set: (provider, value) => ipcRenderer.invoke("keys:set", provider, value),
    remove: (provider) => ipcRenderer.invoke("keys:delete", provider),
    encryptionAvailable: () => ipcRenderer.invoke("keys:encryptionAvailable")
  },
  dialog: {
    openFile: (filters) => ipcRenderer.invoke("dialog:openFile", filters),
    saveFile: (defaultName, filters) => ipcRenderer.invoke("dialog:saveFile", defaultName, filters)
  },
  storage: {
    outputDir: () => ipcRenderer.invoke("storage:outputDir"),
    openOutputDir: () => ipcRenderer.invoke("storage:openOutputDir"),
    readFile: (filePath) => ipcRenderer.invoke("storage:readFile", filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke("storage:writeFile", filePath, data)
  },
  render: {
    start: (job) => ipcRenderer.invoke("render:start", job),
    onProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("render:progress", listener);
      return () => ipcRenderer.removeListener("render:progress", listener);
    }
  }
};
contextBridge.exposeInMainWorld("byok", api);
