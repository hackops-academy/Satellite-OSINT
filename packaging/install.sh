#!/bin/bash
# install.sh - installs AstralOSINT as a desktop application on Kali Linux
# (or any Debian-based distro with a freedesktop-compliant menu).
#
# Installs per-user (no root needed for the app itself - only for
# missing system packages, via sudo, if you approve it):
#   ~/.local/share/astralosint            app files, node_modules
#   ~/.local/bin/astralosint               launcher command
#   ~/.local/share/applications/           AstralOSINT.desktop menu entry
#   ~/.local/share/icons/hicolor/          app icon (scalable SVG)
#
# Run from inside the extracted AstralOSINT folder:
#   ./packaging/install.sh
set -euo pipefail

PACKAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PACKAGING_DIR/.." && pwd)"
INSTALL_DIR="$HOME/.local/share/astralosint"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICON_BASE="$HOME/.local/share/icons/hicolor"
PIXMAPS_DIR="$HOME/.local/share/pixmaps"

echo "=========================================="
echo "  AstralOSINT installer - HackOps Academy"
echo "=========================================="
echo

# ---------------------------------------------------------------------
# 1. Check / install system dependencies
# ---------------------------------------------------------------------
missing=()
command -v node >/dev/null 2>&1 || missing+=("nodejs")
command -v npm >/dev/null 2>&1 || missing+=("npm")
command -v rsync >/dev/null 2>&1 || missing+=("rsync")

if [ "${#missing[@]}" -gt 0 ]; then
    echo "[*] Missing system packages: ${missing[*]}"
    if command -v apt-get >/dev/null 2>&1; then
        read -rp "    Install them now with sudo apt-get? [Y/n] " ans
        if [[ "$ans" =~ ^[Nn]$ ]]; then
            echo "Aborting - install the packages above manually and re-run."
            exit 1
        fi
        sudo apt-get update
        sudo apt-get install -y "${missing[@]}"
    else
        echo "apt-get not found - install these packages manually: ${missing[*]}"
        echo "(On Termux: pkg install nodejs)"
        echo "(On macOS:  brew install node)"
        exit 1
    fi
fi
echo "[*] System dependencies OK."
echo

# ---------------------------------------------------------------------
# 2. Copy application files into the per-user install directory
# ---------------------------------------------------------------------
echo "[*] Installing app files to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
    --exclude 'packaging' \
    --exclude '.git' \
    --exclude 'hud/node_modules' \
    --exclude 'hud/dist' \
    "$REPO_ROOT"/ "$INSTALL_DIR"/

# ---------------------------------------------------------------------
# 3. HUD (Electron) deps
# ---------------------------------------------------------------------
echo "[*] Installing HUD dependencies (this downloads Electron, may take a bit)..."
(cd "$INSTALL_DIR/hud" && npm install --no-audit --no-fund)

# ---------------------------------------------------------------------
# 4. Icon (scalable SVG)
# ---------------------------------------------------------------------
echo "[*] Installing icon..."
mkdir -p "$ICON_BASE/scalable/apps"
cp "$REPO_ROOT/assets/astralosint-logo.svg" "$ICON_BASE/scalable/apps/astralosint.svg"
mkdir -p "$PIXMAPS_DIR"
cp "$REPO_ROOT/assets/astralosint-logo.svg" "$PIXMAPS_DIR/astralosint.svg"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------
# 5. Launcher command
# ---------------------------------------------------------------------
echo "[*] Installing launcher to $BIN_DIR/astralosint ..."
mkdir -p "$BIN_DIR"
cp "$PACKAGING_DIR/bin/astralosint" "$BIN_DIR/astralosint"
chmod +x "$BIN_DIR/astralosint"

# ---------------------------------------------------------------------
# 6. Desktop menu entry
# ---------------------------------------------------------------------
echo "[*] Installing menu entry..."
mkdir -p "$APPS_DIR"
sed "s|__LAUNCHER__|$BIN_DIR/astralosint|" "$PACKAGING_DIR/astralosint.desktop" > "$APPS_DIR/astralosint.desktop"
chmod +x "$APPS_DIR/astralosint.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi

echo
echo "=========================================="
echo "  AstralOSINT installed."
echo "=========================================="
echo
echo "Launch it from your Applications menu (search 'AstralOSINT'),"
echo "or from any terminal with:  astralosint"
echo

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
    echo "NOTE: $BIN_DIR is not on your PATH yet, so the 'astralosint' command"
    echo "won't work from a terminal until you add it. The Applications menu"
    echo "entry will work regardless. To fix the terminal command, add this"
    echo "to ~/.bashrc or ~/.zshrc:"
    echo
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo
fi

echo "Your intel log lives in the app's local storage (per-Electron-profile),"
echo "and any exported/imported JSON files go wherever you choose in the"
echo "native save/open dialogs."
echo
echo "To uninstall later: ./packaging/uninstall.sh"
