const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petViewer", {
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  getPets: () => ipcRenderer.invoke("pets:list"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  getBounds: () => ipcRenderer.invoke("window:get-bounds"),
  moveTo: (x, y) => ipcRenderer.send("window:move-to", x, y),
  close: () => ipcRenderer.send("window:close"),
  minimize: () => ipcRenderer.send("window:minimize"),
  setSize: (size, anchor) => ipcRenderer.send("window:set-size", size, anchor),
  showMenu: (currentPetId) => ipcRenderer.send("pet:show-menu", currentPetId),
  onSelectPet: (callback) => {
    const listener = (_event, petId) => callback(petId);
    ipcRenderer.on("pet:select", listener);
    return () => ipcRenderer.removeListener("pet:select", listener);
  },
  onNextPet: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("pet:next", listener);
    return () => ipcRenderer.removeListener("pet:next", listener);
  },
  onNextAnimation: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("pet:next-animation", listener);
    return () => ipcRenderer.removeListener("pet:next-animation", listener);
  }
});
