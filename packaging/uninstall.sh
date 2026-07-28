#!/bin/bash
# uninstall.sh - removes everything install.sh created.
set -uo pipefail

INSTALL_DIR="$HOME/.local/share/astralosint"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICON_BASE="$HOME/.local/share/icons/hicolor"
PIXMAPS_DIR="$HOME/.local/share/pixmaps"

echo "This removes AstralOSINT and everything under $INSTALL_DIR."
echo "Note: your saved intel log lives inside the Electron app's local"
echo "storage under that directory too, so it will be removed as well."
echo "Export your intel log first if you want to keep it (Intel tab -> Export)."
read -rp "Continue? [y/N] " ans
if [[ ! "$ans" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

rm -rf "$INSTALL_DIR"
rm -f "$BIN_DIR/astralosint"
rm -f "$APPS_DIR/astralosint.desktop"
rm -f "$ICON_BASE/scalable/apps/astralosint.svg"
rm -f "$PIXMAPS_DIR/astralosint.svg"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "AstralOSINT uninstalled."
