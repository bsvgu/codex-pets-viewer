const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const path = require("path");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require("electron");
const packageJson = require("../package.json");

const DEFAULT_WINDOW_SIZE = 340;
const MIN_WINDOW_SIZE = 110;
const MAX_WINDOW_SIZE = 760;
const REPO_FULL_NAME = "bsvgu/codex-pets-viewer";
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO_FULL_NAME}/releases/latest`;
const CONTENT_RELEASE_TAG = "pets-content-stable";
const CONTENT_RELEASE_URL = `https://api.github.com/repos/${REPO_FULL_NAME}/releases/tags/${CONTENT_RELEASE_TAG}`;
const CONTENT_MANIFEST_ASSET = "pet-content-manifest.json";
const UPDATE_STATE_FILE = "update-state.json";
const ACTION_CONFIG_FILE = "action-config.json";

let mainWindow;
let settingsWindow;
let petPickerWindow;

function appPath(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanPathSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^-+|-+$/g, "");
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function defaultActionConfig() {
  return {
    actionType: "none",
    appPath: "",
    browserUrl: "https://www.google.com",
    focusBrowserFirst: true
  };
}

function getActionConfig() {
  return {
    ...defaultActionConfig(),
    ...readJsonFile(userDataPath(ACTION_CONFIG_FILE), {})
  };
}

function saveActionConfig(config) {
  const nextConfig = {
    ...defaultActionConfig(),
    ...config
  };

  writeJsonFile(userDataPath(ACTION_CONFIG_FILE), nextConfig);
  return nextConfig;
}

function readPetsFromRoot(petsRoot, source) {
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

      const manifest = readJsonFile(manifestPath);
      if (!manifest) {
        return null;
      }

      const spritesheetPath = path.join(folder, manifest.spritesheetPath || "spritesheet.webp");

      if (!fs.existsSync(spritesheetPath)) {
        return null;
      }

      return {
        id: manifest.id || entry.name,
        displayName: manifest.displayName || manifest.id || entry.name,
        description: manifest.description || "",
        version: manifest.version || "1.0.0",
        animations: Array.isArray(manifest.animations) ? manifest.animations : [],
        source,
        spriteUrl: pathToFileURL(spritesheetPath).toString()
      };
    })
    .filter(Boolean);
}

function readPets() {
  const petsById = new Map();

  for (const pet of readPetsFromRoot(appPath("assets", "pets"), "bundled")) {
    petsById.set(pet.id, pet);
  }

  for (const pet of readPetsFromRoot(userDataPath("pets"), "downloaded")) {
    petsById.set(pet.id, pet);
  }

  return Array.from(petsById.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function readBundledUpdateManifest() {
  return readJsonFile(appPath("assets", "update-manifest.json"), {
    schemaVersion: 1,
    appVersion: app.getVersion() || packageJson.version,
    pets: []
  });
}

function compareVersions(left, right) {
  const normalize = (value) =>
    String(value || "0")
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Codex-Pets-Viewer"
        }
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          getJson(response.headers.location).then(resolve, reject);
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body.replace(/^\uFEFF/, "")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.setTimeout(12000, () => request.destroy(new Error("Update check timed out")));
    request.on("error", reject);
  });
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "Codex-Pets-Viewer"
        }
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          downloadFile(response.headers.location, filePath).then(resolve, reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`Download returned ${response.statusCode}`));
          return;
        }

        const output = fs.createWriteStream(filePath);
        response.pipe(output);
        output.on("finish", () => output.close(resolve));
        output.on("error", reject);
      }
    );

    request.setTimeout(30000, () => request.destroy(new Error("Download timed out")));
    request.on("error", reject);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function findReleaseExe(assets = []) {
  return (
    assets.find((asset) => /\.exe$/i.test(asset.name) && /codex[.\s-]*pets[.\s-]*viewer/i.test(asset.name)) ||
    assets.find((asset) => /\.exe$/i.test(asset.name)) ||
    null
  );
}

async function checkForUpdates() {
  const release = await getJson(RELEASES_LATEST_URL);
  const asset = findReleaseExe(release.assets || []);
  const currentVersion = app.getVersion() || packageJson.version;
  const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");

  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: release.html_url,
    downloadUrl: asset?.browser_download_url || release.html_url,
    assetName: asset?.name || null,
    body: release.body || ""
  };
}

function buildLocalPetVersionMap() {
  const versions = new Map();

  for (const pet of readPetsFromRoot(appPath("assets", "pets"), "bundled")) {
    versions.set(pet.id, pet.version || "1.0.0");
  }

  for (const pet of readPetsFromRoot(userDataPath("pets"), "downloaded")) {
    versions.set(pet.id, pet.version || "1.0.0");
  }

  return versions;
}

async function fetchContentManifest() {
  const release = await getJson(CONTENT_RELEASE_URL);
  const assets = release.assets || [];
  const manifestAsset = assets.find((asset) => asset.name === CONTENT_MANIFEST_ASSET);

  if (!manifestAsset) {
    throw new Error(`${CONTENT_MANIFEST_ASSET} fehlt im Content-Release.`);
  }

  const manifest = await getJson(manifestAsset.browser_download_url);
  return { release, manifest, assets };
}

async function checkContentUpdates() {
  try {
    const { release, manifest, assets } = await fetchContentManifest();
    const currentVersion = app.getVersion() || packageJson.version;
    const minimumAppVersion = manifest.minimumAppVersion || "1.0.0";

    if (compareVersions(minimumAppVersion, currentVersion) > 0) {
      return {
        ok: true,
        appTooOld: true,
        minimumAppVersion,
        updates: [],
        releaseUrl: release.html_url
      };
    }

    const localVersions = buildLocalPetVersionMap();
    const assetsByName = new Map(assets.map((asset) => [asset.name, asset]));
    const updates = (manifest.pets || [])
      .map((pet) => {
        const asset = assetsByName.get(pet.assetName);
        const installedVersion = localVersions.get(pet.id) || null;
        const needsInstall = !installedVersion || compareVersions(pet.version, installedVersion) > 0;

        return {
          id: pet.id,
          displayName: pet.displayName || pet.id,
          description: pet.description || "",
          version: pet.version || "1.0.0",
          installedVersion,
          assetName: pet.assetName,
          sha256: pet.sha256,
          downloadUrl: asset?.browser_download_url || null,
          missingAsset: !asset,
          needsInstall
        };
      })
      .filter((pet) => pet.needsInstall);

    return {
      ok: true,
      appTooOld: false,
      releaseUrl: release.html_url,
      updates,
      manifest
    };
  } catch (error) {
    return { ok: false, error: error.message, updates: [] };
  }
}

function resolveExtractedPetRoot(extractRoot) {
  const directManifest = path.join(extractRoot, "pet.json");

  if (fs.existsSync(directManifest)) {
    return extractRoot;
  }

  const folders = fs
    .readdirSync(extractRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  if (folders.length === 1) {
    const nestedRoot = path.join(extractRoot, folders[0].name);
    if (fs.existsSync(path.join(nestedRoot, "pet.json"))) {
      return nestedRoot;
    }
  }

  return null;
}

async function extractZip(zipPath, destinationPath) {
  const safeZip = zipPath.replace(/'/g, "''");
  const safeDestination = destinationPath.replace(/'/g, "''");
  const result = await runPowerShell(
    `Expand-Archive -LiteralPath '${safeZip}' -DestinationPath '${safeDestination}' -Force`,
    30000
  );

  if (!result.ok) {
    throw new Error("ZIP konnte nicht entpackt werden.");
  }
}

function installExtractedPet(petRoot, expectedPet) {
  const manifestPath = path.join(petRoot, "pet.json");
  const manifest = readJsonFile(manifestPath);

  if (!manifest) {
    throw new Error("pet.json konnte nicht gelesen werden.");
  }

  const petId = manifest.id || expectedPet.id;
  if (petId !== expectedPet.id) {
    throw new Error(`Pet-ID stimmt nicht: ${petId}`);
  }

  const spritesheetPath = path.join(petRoot, manifest.spritesheetPath || "spritesheet.webp");
  if (!fs.existsSync(spritesheetPath)) {
    throw new Error("Spritesheet fehlt im Pet-Pack.");
  }

  const installRoot = userDataPath("pets", cleanPathSegment(expectedPet.id));
  const nextManifest = {
    ...manifest,
    id: expectedPet.id,
    displayName: manifest.displayName || expectedPet.displayName || expectedPet.id,
    description: manifest.description || expectedPet.description || "",
    version: expectedPet.version || manifest.version || "1.0.0"
  };

  fs.rmSync(installRoot, { recursive: true, force: true });
  fs.mkdirSync(installRoot, { recursive: true });
  fs.cpSync(petRoot, installRoot, { recursive: true });
  writeJsonFile(path.join(installRoot, "pet.json"), nextManifest);
}

function notifyPetsChanged() {
  mainWindow?.webContents.send("pets:changed");
  petPickerWindow?.webContents.send("pets:changed");
}

async function installContentUpdates() {
  const check = await checkContentUpdates();

  if (!check.ok || check.appTooOld || !check.updates.length) {
    return check;
  }

  const workRoot = path.join(app.getPath("temp"), `codex-pets-content-${Date.now()}`);
  const installed = [];

  try {
    fs.mkdirSync(workRoot, { recursive: true });

    for (const pet of check.updates) {
      if (!pet.downloadUrl || pet.missingAsset) {
        throw new Error(`Asset fehlt: ${pet.assetName}`);
      }

      const zipPath = path.join(workRoot, pet.assetName);
      const extractRoot = path.join(workRoot, `${cleanPathSegment(pet.id)}-extract`);

      await downloadFile(pet.downloadUrl, zipPath);

      if (pet.sha256 && sha256File(zipPath).toLowerCase() !== String(pet.sha256).toLowerCase()) {
        throw new Error(`Hash stimmt nicht: ${pet.displayName}`);
      }

      fs.mkdirSync(extractRoot, { recursive: true });
      await extractZip(zipPath, extractRoot);

      const petRoot = resolveExtractedPetRoot(extractRoot);
      if (!petRoot) {
        throw new Error(`Pet-Pack ungueltig: ${pet.displayName}`);
      }

      installExtractedPet(petRoot, pet);
      installed.push(pet);
    }
  } catch (error) {
    if (installed.length) {
      notifyPetsChanged();
    }

    return { ok: false, error: error.message, installed };
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  notifyPetsChanged();
  return { ok: true, installed, updates: [] };
}

async function checkForUpdatesAndNotify(manual = false) {
  if (!mainWindow) {
    return null;
  }

  const resultState = {
    app: null,
    content: null
  };

  try {
    const update = await checkForUpdates();
    resultState.app = update;

    if (update.updateAvailable) {
      const statePath = userDataPath(UPDATE_STATE_FILE);
      const state = readJsonFile(statePath, {});

      if (manual || state.lastNotifiedVersion !== update.latestVersion) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Update verfuegbar",
          message: `Version ${update.latestVersion} ist verfuegbar.`,
          detail: `Installiert: ${update.currentVersion}\n\nDie neue EXE wird ueber GitHub Releases verteilt.`,
          buttons: ["EXE herunterladen", "Release ansehen", "Spaeter"],
          defaultId: 0,
          cancelId: 2
        });

        writeJsonFile(statePath, {
          ...state,
          lastNotifiedVersion: update.latestVersion
        });

        if (result.response === 0) {
          shell.openExternal(update.downloadUrl);
        } else if (result.response === 1) {
          shell.openExternal(update.releaseUrl);
        }
      }
    }
  } catch (error) {
    resultState.app = { ok: false, error: error.message };
  }

  const content = await checkContentUpdates();
  resultState.content = content;

  if (content.ok && content.appTooOld && manual) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Content Update",
      message: "Content-Updates brauchen eine neuere App.",
      detail: `Mindestens benoetigt: ${content.minimumAppVersion}`
    });
    return resultState;
  }

  if (content.ok && content.updates.length) {
    const signature = content.updates.map((pet) => `${pet.id}@${pet.version}`).join("|");
    const statePath = userDataPath(UPDATE_STATE_FILE);
    const state = readJsonFile(statePath, {});

    if (manual || state.lastContentSignature !== signature) {
      const names = content.updates.map((pet) => `${pet.displayName} ${pet.version}`).join("\n");
      const result = await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Pet Updates verfuegbar",
        message: `${content.updates.length} Pet-Update(s) verfuegbar.`,
        detail: names,
        buttons: ["Installieren", "Spaeter"],
        defaultId: 0,
        cancelId: 1
      });

      writeJsonFile(statePath, {
        ...state,
        lastContentSignature: signature
      });

      if (result.response === 0) {
        const install = await installContentUpdates();
        resultState.contentInstall = install;

        if (manual || install.installed?.length) {
          await dialog.showMessageBox(mainWindow, {
            type: install.ok ? "info" : "warning",
            title: "Pet Updates",
            message: install.ok ? "Pet-Updates installiert." : "Pet-Updates fehlgeschlagen.",
            detail: install.ok
              ? `${install.installed?.length || 0} Pet(s) installiert.`
              : install.error || "Unbekannter Fehler."
          });
        }
      }
    }
  } else if (manual) {
    const appInfo = resultState.app?.ok === false
      ? `App-Update-Check fehlgeschlagen: ${resultState.app.error}`
      : resultState.app?.updateAvailable
        ? `App-Version ${resultState.app.latestVersion} ist verfuegbar.`
        : `Installiert: ${resultState.app?.currentVersion || app.getVersion() || packageJson.version}`;
    const contentInfo = content.ok
      ? "Keine Pet-Updates verfuegbar."
      : `Pet-Update-Check fehlgeschlagen: ${content.error}`;

    await dialog.showMessageBox(mainWindow, {
      type: content.ok && resultState.app?.ok !== false ? "info" : "warning",
      title: "Update",
      message: content.ok && !resultState.app?.updateAvailable ? "Du hast die aktuelle Version." : "Update-Check abgeschlossen.",
      detail: `${appInfo}\n${contentInfo}`
    });
  }

  return resultState;
}

function runPowerShell(script, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout },
      (error, stdout) => {
        resolve({ ok: !error, output: String(stdout || "").trim() });
      }
    );
  });
}

async function focusProcessNames(processNames) {
  const names = processNames
    .map((name) => String(name || "").replace(/[^a-zA-Z0-9_.-]/g, ""))
    .filter(Boolean);

  if (!names.length) {
    return false;
  }

  const namesLiteral = names.map((name) => `'${name}'`).join(",");
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
    $names = @(${namesLiteral})
    foreach ($name in $names) {
      $process = Get-Process -Name $name -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
      if ($process) {
        [Win32]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
        [Win32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
        Write-Output "focused"
        exit 0
      }
    }
    exit 1
  `;
  const result = await runPowerShell(script);

  return result.ok && result.output.includes("focused");
}

async function runBrowserAction(config) {
  if (config.focusBrowserFirst) {
    const focused = await focusProcessNames(["chrome", "msedge", "firefox", "brave", "opera", "vivaldi"]);
    if (focused) {
      return { ok: true, action: "focused-browser" };
    }
  }

  await shell.openExternal(config.browserUrl || "https://www.google.com");
  return { ok: true, action: "opened-browser" };
}

async function runAppAction(config) {
  if (!config.appPath) {
    openSettingsWindow();
    return { ok: false, error: "Keine App ausgewaehlt." };
  }

  if (/\.exe$/i.test(config.appPath)) {
    const processName = path.basename(config.appPath, path.extname(config.appPath));
    const focused = await focusProcessNames([processName]);

    if (focused) {
      return { ok: true, action: "focused-app" };
    }
  }

  const error = await shell.openPath(config.appPath);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, action: "opened-app" };
}

async function runConfiguredAction() {
  const config = getActionConfig();

  if (config.actionType === "browser") {
    return runBrowserAction(config);
  }

  if (config.actionType === "app") {
    return runAppAction(config);
  }

  return { ok: true, action: "none" };
}

async function chooseApplication() {
  const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
    title: "App auswaehlen",
    properties: ["openFile"],
    filters: [
      { name: "Apps", extensions: ["exe", "lnk", "bat", "cmd"] },
      { name: "Alle Dateien", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
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
    resizable: false,
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

function getSettingsWindowBounds() {
  const width = 460;
  const height = 550;
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  const area = display.workArea;

  return {
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2)
  };
}

function getCenteredWindowBounds(width, height) {
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  const area = display.workArea;

  return {
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2)
  };
}

function openSettingsWindow() {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }

    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const bounds = getSettingsWindowBounds();

  settingsWindow = new BrowserWindow({
    ...bounds,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Pet Aktion",
    backgroundColor: "#f6f7f9",
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: appPath("src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  settingsWindow.loadFile(appPath("src", "settings.html")).catch((error) => {
    dialog.showErrorBox("Pet Aktion", `Einstellungen konnten nicht geoeffnet werden:\n${error.message}`);
    settingsWindow?.close();
  });
  settingsWindow.focus();
}

function openPetPickerWindow(currentPetId = "") {
  if (petPickerWindow) {
    if (petPickerWindow.isMinimized()) {
      petPickerWindow.restore();
    }

    petPickerWindow.show();
    petPickerWindow.focus();
    petPickerWindow.webContents.send("pet-picker:current", currentPetId);
    return;
  }

  petPickerWindow = new BrowserWindow({
    ...getCenteredWindowBounds(640, 560),
    minWidth: 520,
    minHeight: 420,
    title: "Pet aendern",
    backgroundColor: "#f6f7f9",
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: appPath("src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petPickerWindow.setMenuBarVisibility(false);
  petPickerWindow.on("closed", () => {
    petPickerWindow = null;
  });
  petPickerWindow.loadFile(appPath("src", "pet-picker.html"), {
    query: { currentPetId }
  }).catch((error) => {
    dialog.showErrorBox("Pet aendern", `Pet-Auswahl konnte nicht geoeffnet werden:\n${error.message}`);
    petPickerWindow?.close();
  });
  petPickerWindow.focus();
}

function setWindowSize(width, height = width, anchor = "center") {
  if (!mainWindow) {
    return;
  }

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
    return mainWindow.getBounds();
  }

  const nextWidth = Math.round(Math.min(MAX_WINDOW_SIZE, Math.max(MIN_WINDOW_SIZE, parsedWidth)));
  const nextHeight = Math.round(Math.min(MAX_WINDOW_SIZE + 80, Math.max(MIN_WINDOW_SIZE, parsedHeight)));
  const bounds = mainWindow.getBounds();
  let nextX = bounds.x + Math.round((bounds.width - nextWidth) / 2);
  let nextY = bounds.y + Math.round((bounds.height - nextHeight) / 2);

  if (anchor === "top-left") {
    nextX = bounds.x;
    nextY = bounds.y;
  }

  if (anchor === "show-controls") {
    nextY = bounds.y - Math.max(0, nextHeight - bounds.height);
  }

  if (anchor === "hide-controls") {
    nextY = bounds.y + Math.max(0, bounds.height - nextHeight);
  }

  const area = screen.getDisplayMatching({
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight
  }).workArea;
  nextX = Math.min(area.x + area.width - nextWidth, Math.max(area.x, nextX));
  nextY = Math.min(area.y + area.height - nextHeight, Math.max(area.y, nextY));

  mainWindow.setBounds({
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight
  });

  return mainWindow.getBounds();
}

function moveWindowTo(x, y) {
  if (!mainWindow) {
    return;
  }

  const nextX = Number(x);
  const nextY = Number(y);
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    return;
  }

  mainWindow.setPosition(Math.round(nextX), Math.round(nextY), false);
}

function showPetMenu(currentPetId) {
  if (!mainWindow) {
    return;
  }

  const template = [
    {
      label: "Pet aendern",
      click: () => openPetPickerWindow(currentPetId)
    },
    { type: "separator" },
    {
      label: "Naechste Animation",
      click: () => mainWindow.webContents.send("pet:next-animation")
    },
    {
      label: "Naechstes Pet",
      click: () => mainWindow.webContents.send("pet:next")
    },
    {
      label: "Update pruefen",
      click: () => checkForUpdatesAndNotify(true)
    },
    {
      label: "Aktion einstellen",
      click: () => openSettingsWindow()
    },
    {
      label: "Aktion testen",
      click: () => runConfiguredAction()
    },
    { type: "separator" },
    {
      label: "Schliessen",
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
    ipcMain.handle("app:info", () => ({
      version: app.getVersion() || packageJson.version,
      repo: REPO_FULL_NAME,
      updateManifest: readBundledUpdateManifest()
    }));
    ipcMain.handle("action:get-config", () => getActionConfig());
    ipcMain.handle("action:save-config", (_event, config) => saveActionConfig(config));
    ipcMain.handle("action:choose-app", () => chooseApplication());
    ipcMain.handle("action:run", () => runConfiguredAction());
    ipcMain.handle("pets:list", () => readPets());
    ipcMain.handle("updates:check", () => checkForUpdates());
    ipcMain.handle("content:check", () => checkContentUpdates());
    ipcMain.handle("content:install", () => installContentUpdates());
    ipcMain.handle("window:get-bounds", () => mainWindow?.getBounds() || null);
    ipcMain.on("window:close", () => app.quit());
    ipcMain.on("window:minimize", () => mainWindow?.minimize());
    ipcMain.on("window:move-to", (_event, x, y) => moveWindowTo(x, y));
    ipcMain.handle("window:set-size", (_event, width, height, anchor) => setWindowSize(width, height, anchor));
    ipcMain.on("pet:show-menu", (_event, currentPetId) => showPetMenu(currentPetId));
    ipcMain.on("pet-picker:open", (_event, currentPetId) => openPetPickerWindow(currentPetId));
    ipcMain.on("pet:select", (_event, petId) => {
      mainWindow?.webContents.send("pet:select", petId);
      petPickerWindow?.close();
    });
    ipcMain.on("settings:open", () => openSettingsWindow());

    createWindow();
    setTimeout(() => checkForUpdatesAndNotify(false), 2500);
  });
}

app.on("window-all-closed", () => {
  app.quit();
});
