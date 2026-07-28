# Packaging

Turns AstralOSINT into a proper per-user desktop install, same pattern as
MetaGhost.

## Install

```bash
cd AstralOSINT
./packaging/install.sh
```

This will:

1. Check for `node`, `npm`, and `rsync`, offering to `apt-get install`
   anything missing.
2. Copy the app into `~/.local/share/astralosint`.
3. Run `npm install` inside `hud/` (pulls down Electron).
4. Install the app icon into `~/.local/share/icons/hicolor/scalable/apps/`
   and `~/.local/share/pixmaps/`.
5. Install the `astralosint` launcher command to `~/.local/bin/astralosint`.
6. Install an `AstralOSINT.desktop` menu entry to
   `~/.local/share/applications/`.

No `sudo` is needed for the app itself — only for installing missing
system packages, and only with your confirmation.

Launch it from your Applications menu (search "AstralOSINT") or from any
terminal with `astralosint`.

Unlike MetaGhost, there's no local API server involved — AstralOSINT is a
static, client-side console that talks directly to the public OSM /
Nominatim / OSRM APIs from inside the Electron window, so the launcher
just starts Electron directly.

## Uninstall

```bash
./packaging/uninstall.sh
```

Removes the install directory, launcher, menu entry, and icon. Your
intel log lives in the Electron app's local storage inside that install
directory too, so **export it first** (Intel tab → Export) if you want
to keep it — the uninstaller warns about this before deleting anything.

## Files in this folder

| File | Purpose |
|---|---|
| `install.sh` | Per-user installer (see above). |
| `uninstall.sh` | Reverses everything `install.sh` did. |
| `bin/astralosint` | The launcher script copied to `~/.local/bin/astralosint`. |
| `astralosint.desktop` | Freedesktop menu entry template — `install.sh` substitutes `__LAUNCHER__` with the real installed launcher path. |
