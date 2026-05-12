const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("animationEditor", {
  listPets: () => ipcRenderer.invoke("editor:list-pets"),
  savePet: (payload) => ipcRenderer.invoke("editor:save-pet", payload),
  openPetsFolder: () => ipcRenderer.invoke("editor:open-pets-folder")
});
