#!/bin/bash
# start.sh - launches the AstralOSINT desktop console.
# Requires ./setup.sh to have been run first.
set -e
cd "$(dirname "$0")"

if [ ! -d "hud/node_modules" ]; then
    echo "No hud/node_modules found - run ./setup.sh first."
    exit 1
fi

cd hud && npm start
