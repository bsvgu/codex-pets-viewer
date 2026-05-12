const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const PETS_ROOT = path.join(ROOT, "assets", "pets");

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function bumpPatch(version = "1.0.0") {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }

  parts[2] += 1;
  return parts.slice(0, 3).join(".");
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeAnimations(animations) {
  return (Array.isArray(animations) ? animations : [])
    .map((animation) => {
      const id = String(animation?.id || "").trim();
      if (!id) {
        return null;
      }

      return {
        id,
        loops: clampInt(animation.loops, 1, 99, 1),
        sequence: (Array.isArray(animation.sequence) ? animation.sequence : [])
          .map((cell) => ({
            row: clampInt(cell.row, 0, 8, 0),
            col: clampInt(cell.col ?? cell.frame, 0, 7, 0),
            duration: clampInt(cell.duration, 40, 3000, 140)
          }))
      };
    })
    .filter(Boolean);
}

function listPets() {
  if (!fs.existsSync(PETS_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(PETS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(PETS_ROOT, entry.name);
      const manifestPath = path.join(folder, "pet.json");
      const manifest = readJson(manifestPath);

      if (!manifest) {
        return null;
      }

      const spritesheetPath = path.join(folder, manifest.spritesheetPath || "spritesheet.webp");
      if (!fs.existsSync(spritesheetPath)) {
        return null;
      }

      return {
        folderName: entry.name,
        id: manifest.id || entry.name,
        displayName: manifest.displayName || manifest.id || entry.name,
        version: manifest.version || "1.0.0",
        description: manifest.description || "",
        animations: Array.isArray(manifest.animations) ? manifest.animations : [],
        spriteUrl: pathToFileURL(spritesheetPath).toString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function savePetAnimations(_event, payload) {
  const petId = String(payload?.id || "");
  const pet = listPets().find((candidate) => candidate.id === petId);

  if (!pet) {
    throw new Error(`Pet nicht gefunden: ${petId}`);
  }

  const manifestPath = path.join(PETS_ROOT, pet.folderName, "pet.json");
  const manifest = readJson(manifestPath);

  if (!manifest) {
    throw new Error("pet.json konnte nicht gelesen werden.");
  }

  const nextVersion = String(payload.version || bumpPatch(manifest.version || "1.0.0")).trim();
  manifest.version = nextVersion;
  manifest.animations = normalizeAnimations(payload.animations);
  writeJson(manifestPath, manifest);

  return {
    ok: true,
    id: petId,
    version: nextVersion
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Codex Pets Animation Editor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("editor:list-pets", listPets);
  ipcMain.handle("editor:save-pet", savePetAnimations);
  ipcMain.handle("editor:open-pets-folder", () => shell.openPath(PETS_ROOT));
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
