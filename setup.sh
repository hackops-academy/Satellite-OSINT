#!/bin/bash
# setup.sh - one-time setup for the AstralOSINT desktop console.
# Run this once after cloning: ./setup.sh
set -e
cd "$(dirname "$0")"

if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "[!] Node.js/npm not found."
    if [ -f /data/data/com.termux/files/usr/bin/pkg ]; then
        pkg update -y && pkg install nodejs -y
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y nodejs npm
    elif command -v brew &> /dev/null; then
        brew install node
    elif command -v pacman &> /dev/null; then
        sudo pacman -S nodejs npm
    else
        echo "[X] Could not auto-install. Install Node.js manually, then re-run this script."
        exit 1
    fi
else
    echo "[✔] Node.js is installed ($(node --version))."
fi

echo "[*] Installing HUD (Electron) dependencies..."
cd hud
npm install
cd ..

echo ""
echo "Setup complete."
echo "Run ./start.sh to launch AstralOSINT."
echo "(Prefer the browser version instead? ./run.sh still works standalone.)"
