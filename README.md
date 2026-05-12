# Codex Pets Viewer

Portable Windows viewer for bundled Codex-style pet animations.

## Included pets

- Little Black Mage
- Merry
- Mimi
- Veiglet

## Usage

- Left-click drag: move the pet
- Right-click: open the pet menu
- Mouse wheel or `+` / `-`: resize
- Hover: show controls
- `Esc`: quit

## Build

```powershell
npm install
npm run build:win
```

The portable EXE is written to `dist/Codex Pets Viewer.exe`.

## Updates

The app checks GitHub Releases for the latest stable version.

- Full app updates are distributed as a new portable EXE release asset.
- The app opens the GitHub download page; users replace the old EXE with the new one.
- Pet assets are versioned in `assets/update-manifest.json`.
- Downloaded future pet packs can live in the app data `pets` folder and override bundled pets by id.

Skipped versions are safe when each release contains a complete app snapshot. A user can jump from `v1.0.0` to `v1.3.0` without installing `v1.1.0` or `v1.2.0`.
