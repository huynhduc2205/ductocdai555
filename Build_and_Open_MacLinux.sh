#!/usr/bin/env bash
set -e

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Chưa cài Node.js. Vui lòng cài tại https://nodejs.org"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] Không tìm thấy npm."
  exit 1
fi

echo "[1/3] Cài dependencies..."
npm install

echo "[2/3] Build project..."
npm run build

BUILD_DIR="build"
if [ ! -f "./build/index.html" ] && [ -f "./dist/index.html" ]; then
  BUILD_DIR="dist"
fi

echo "[3/3] Mở $BUILD_DIR/index.html..."
# macOS open, Linux xdg-open
if command -v open >/dev/null 2>&1; then
  open "./$BUILD_DIR/index.html"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "./$BUILD_DIR/index.html"
else
  echo "Hãy tự mở file: $BUILD_DIR/index.html"
fi

echo "Hoàn tất!"
