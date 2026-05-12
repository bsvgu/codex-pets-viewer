# Codex Pets Viewer

Portable Windows viewer for bundled Codex-style pet animations.

## Included pets

- Little Black Mage
- Merry
- Mimi
- Veiglet

## Usage

- Left-click drag: move the pet
- Double-click: run the configured pet action
- Right-click: open the pet menu
- Mouse wheel or `+` / `-`: resize
- Left-click the pet: show controls
- `Esc`: quit

## Pet action

Open `Aktion einstellen` from the right-click menu or the `S` button.

- `Browser anzeigen`: restores a running browser if possible, otherwise opens the configured URL.
- `App starten`: restores the selected app if it is already running, otherwise starts it.
- `Keine Aktion`: disables double-click actions.

## Build

```powershell
npm install
npm run build:win
```

The portable EXE is written to `dist/Codex Pets Viewer.exe`.

## Updates

The app checks GitHub Releases for the latest stable app and pet content versions.

- Full app updates are distributed as a new portable EXE release asset.
- The app opens the GitHub download page; users replace the old EXE with the new one.
- Settings are stored in the user's app data folder and stay available after replacing the EXE.
- Pet content is distributed through the fixed `pets-content-stable` GitHub Release.
- The content release contains `pet-content-manifest.json` plus `pet-<id>-<version>.zip` packs.
- Downloaded pet packs live in the app data `pets` folder and override bundled pets by id.

Skipped versions are safe when each release contains a complete app snapshot. A user can jump from `v1.0.0` to `v1.3.0` without installing `v1.1.0` or `v1.2.0`.

## Pet content release

Build content assets:

```powershell
.\scripts\build-content-release.ps1
```

Upload them to the stable content release:

```powershell
.\scripts\upload-content-release.ps1
```
