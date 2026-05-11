const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, ipcMain, Menu } = require("electron");

const DEFAULT_WINDOW_SIZE = 340;
const MIN_WINDOW_SIZE = 110;
const MAX_WINDOW_SIZE = 760;

let mainWindow;

function appPath(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

function readPets() {
  const petsRoot = appPath("assets", "pets");

  if (!fs.existsSync(petsRoot)) {
    return [];
  }

  return fs
    .readdirSync(petsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(petsRoot, entry.name);
      const manifestPath = path.join(folder, "pet.json");

      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const spritesheetPath = path.join(folder, manifest.spritesheetPath || "spritesheet.webp");

      if (!fs.existsSync(spritesheetPath)) {
        return null;
      }

      return {
        id: manifest.id || entry.name,
        displayName: manifest.displayName || manifest.id || entry.name,
        description: manifest.description || "",
        spriteUrl: pathToFileURL(spritesheetPath).toString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE,
    height: DEFAULT_WINDOW_SIZE,
    minWidth: MIN_WINDOW_SIZE,
    minHeight: MIN_WINDOW_SIZE,
    maxWidth: MAX_WINDOW_SIZE,
    maxHeight: MAX_WINDOW_SIZE,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    title: "Codex Pets Viewer",
    webPreferences: {
      preload: appPath("src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(appPath("src", "index.html"));
}

function setWindowSize(size, anchor = "center") {
  if (!mainWindow) {
    return;
  }

  const nextSize = Math.round(Math.min(MAX_WINDOW_SIZE, Math.max(MIN_WINDOW_SIZE, size)));
  const bounds = mainWindow.getBounds();
  const keepTopLeft = anchor === "top-left";

  mainWindow.setBounds({
    x: keepTopLeft ? bounds.x : bounds.x + Math.round((bounds.width - nextSize) / 2),
    y: keepTopLeft ? bounds.y : bounds.y + Math.round((bounds.height - nextSize) / 2),
    width: nextSize,
    height: nextSize
  });
}

function moveWindowTo(x, y) {
  if (!mainWindow) {
    return;
  }

  mainWindow.setPosition(Math.round(x), Math.round(y), false);
}

function showPetMenu(currentPetId) {
  if (!mainWindow) {
    return;
  }

  const pets = readPets();
  const template = [
    {
      label: "Pet ändern",
      submenu: pets.map((pet) => ({
        label: pet.displayName,
        type: "radio",
        checked: pet.id === currentPetId,
        click: () => mainWindow.webContents.send("pet:select", pet.id)
      }))
    },
    { type: "separator" },
    {
      label: "Nächste Animation",
      click: () => mainWindow.webContents.send("pet:next-animation")
    },
    {
      label: "Nächstes Pet",
      click: () => mainWindow.webContents.send("pet:next")
    },
    { type: "separator" },
    {
      label: "Schließen",
      click: () => app.quit()
    }
  ];

  Menu.buildFromTemplate(template).popup({ window: mainWindow });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    ipcMain.handle("pets:list", () => readPets());
    ipcMain.handle("window:get-bounds", () => mainWindow?.getBounds() || null);
    ipcMain.on("window:close", () => app.quit());
    ipcMain.on("window:minimize", () => mainWindow?.minimize());
    ipcMain.on("window:move-to", (_event, x, y) => moveWindowTo(x, y));
    ipcMain.on("window:set-size", (_event, size, anchor) => setWindowSize(size, anchor));
    ipcMain.on("pet:show-menu", (_event, currentPetId) => showPetMenu(currentPetId));

    createWindow();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});
