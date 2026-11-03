#!/usr/bin/env bash
# ==============================================================================
#  Pilothouse - Installer for macOS and Linux (Windows: use the Setup .exe from Releases)
#  Author: Ali Emre Sarıbıyık (aemresrbyk)
#  Repository: https://github.com/aemresrbyk/pilothouse
# ==============================================================================

set -e

# Colors for terminal styling
BOLD='\033[1m'
ACCENT='\033[38;2;204;107;73m' # Terracotta
AMBER='\033[38;2;245;158;11m'  # Amber
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${ACCENT}${BOLD}"
cat << "EOF"
   ___ _              _
  / __| |___ __| |_ _ _ ___ _ _
 | _|| / -_) _|  _| '_/ _ \ ' \
 |___|_\___\__|\__|_| \___/_||_|

     >_  desktop cockpit for Claude Code
EOF
echo -e "${NC}"
echo -e "${AMBER}Automated Setup & Installer for macOS and Linux${NC}"
echo -e "Repository: ${BLUE}https://github.com/aemresrbyk/pilothouse${NC}"
echo "--------------------------------------------------------"

# 1. System Check
OS="$(uname -s)"
if [ "$OS" = "Linux" ]; then
  # Linux: the AppImage from the latest release into ~/.local/bin, plus a menu entry.
  if [ "$(uname -m)" != "x86_64" ]; then
    echo -e "${RED}[ERROR] Linux builds are x64 only for now. Build from source: npm install && npm run dist:linux${NC}"
    exit 1
  fi
  BIN_DIR="$HOME/.local/bin"
  APPIMAGE="$BIN_DIR/Pilothouse.AppImage"
  mkdir -p "$BIN_DIR" "$HOME/.local/share/applications"
  echo -e "Downloading the latest Linux release from GitHub..."
  curl -fsSL -o "$APPIMAGE.part" "https://github.com/aemresrbyk/pilothouse/releases/latest/download/Pilothouse-x86_64-linux.AppImage" || {
    echo -e "${RED}[ERROR] Could not download the AppImage.${NC}"
    exit 1
  }
  mv "$APPIMAGE.part" "$APPIMAGE"
  chmod +x "$APPIMAGE"
  cat > "$HOME/.local/share/applications/pilothouse.desktop" <<DESKTOP
[Desktop Entry]
Name=Pilothouse
Comment=Tabbed terminals for Claude Code, Codex and other AI agents
Exec=$APPIMAGE
Terminal=false
Type=Application
Categories=Development;
DESKTOP
  echo -e "${GREEN}✓${NC} Installed ${BOLD}$APPIMAGE${NC} (also in your app menu as Pilothouse)"
  echo "AppImages need FUSE 2: on Ubuntu 22.04+ run 'sudo apt install libfuse2' if it doesn't start."
  echo "Prefer a package? The .deb is on https://github.com/aemresrbyk/pilothouse/releases"
  exit 0
fi
if [ "$OS" != "Darwin" ]; then
  echo -e "${RED}[ERROR] On Windows, download Pilothouse-Setup-x64.exe from https://github.com/aemresrbyk/pilothouse/releases${NC}"
  exit 1
fi

ARCH="$(uname -m)"
echo -e "${GREEN}✓${NC} Operating System: macOS (${ARCH})"

# 2. Check Claude Code CLI
echo -e "\n${BOLD}[1/4] Checking Claude Code CLI environment...${NC}"
CLAUDE_BIN=""
if command -v claude &>/dev/null; then
  CLAUDE_BIN="$(command -v claude)"
elif [ -f "$HOME/.local/bin/claude" ]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
elif [ -f "/opt/homebrew/bin/claude" ]; then
  CLAUDE_BIN="/opt/homebrew/bin/claude"
elif [ -f "$HOME/.bun/bin/claude" ]; then
  CLAUDE_BIN="$HOME/.bun/bin/claude"
fi

if [ -n "$CLAUDE_BIN" ]; then
  CLAUDE_VER="$("$CLAUDE_BIN" --version 2>/dev/null || echo "detected")"
  echo -e "${GREEN}✓${NC} Claude Code CLI detected: ${BOLD}${CLAUDE_VER}${NC} (${CLAUDE_BIN})"
else
  echo -e "${AMBER}! Claude Code CLI is not in PATH yet.${NC}"
  echo -e "  You can install it with: ${BOLD}npm install -g @anthropic-ai/claude-code${NC}"
fi

# 3. Installation Target
APP_NAME="Pilothouse.app"
DEST_DIR="/Applications"
TARGET_APP="${DEST_DIR}/${APP_NAME}"

echo -e "\n${BOLD}[2/4] Installing ${APP_NAME}...${NC}"

# Check if running inside git clone repository with prebuilt release
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_RELEASE=""

if [ "$ARCH" = "arm64" ] && [ -d "${SCRIPT_DIR}/release/mac-arm64/${APP_NAME}" ]; then
  LOCAL_RELEASE="${SCRIPT_DIR}/release/mac-arm64/${APP_NAME}"
elif [ -d "${SCRIPT_DIR}/release/mac/${APP_NAME}" ]; then
  LOCAL_RELEASE="${SCRIPT_DIR}/release/mac/${APP_NAME}"
fi

if [ -n "$LOCAL_RELEASE" ]; then
  echo -e "Installing from local release bundle..."
  rm -rf "${TARGET_APP}"
  cp -R "${LOCAL_RELEASE}" "${TARGET_APP}"
elif [ -f "${SCRIPT_DIR}/package.json" ]; then
  echo -e "Building from source repository..."
  cd "${SCRIPT_DIR}"
  if command -v bun &>/dev/null; then
    bun install
    bun run build
    CSC_IDENTITY_AUTO_DISCOVERY=false bun run pack
  else
    npm install
    npm run build
    npm run pack
  fi
  
  if [ -d "release/mac-arm64/${APP_NAME}" ]; then
    rm -rf "${TARGET_APP}"
    cp -R "release/mac-arm64/${APP_NAME}" "${TARGET_APP}"
  elif [ -d "release/mac/${APP_NAME}" ]; then
    rm -rf "${TARGET_APP}"
    cp -R "release/mac/${APP_NAME}" "${TARGET_APP}"
  fi
else
  # Remote install: download latest release from GitHub
  echo -e "Downloading latest release package from GitHub..."
  TMP_DIR="$(mktemp -d)"
  GITHUB_REPO="aemresrbyk/pilothouse"
  # electron-builder calls Intel "x64"; uname reports "x86_64"
  RELEASE_ARCH="$ARCH"; [ "$ARCH" = "x86_64" ] && RELEASE_ARCH="x64"
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/Pilothouse-${RELEASE_ARCH}-mac.zip"
  
  curl -fsSL -o "${TMP_DIR}/app.zip" "${DOWNLOAD_URL}" || {
    echo -e "${RED}[ERROR] Could not download pre-built release package.${NC}"
    echo "Please clone the repository and run: ./install.sh"
    exit 1
  }
  
  unzip -q "${TMP_DIR}/app.zip" -d "${TMP_DIR}"
  rm -rf "${TARGET_APP}"
  cp -R "${TMP_DIR}/${APP_NAME}" "${TARGET_APP}"
  rm -rf "${TMP_DIR}"
fi

echo -e "${GREEN}✓${NC} Successfully copied to ${BOLD}${TARGET_APP}${NC}"

# 4. Gatekeeper Quarantine Removal
echo -e "\n${BOLD}[3/4] Configuring macOS permissions...${NC}"
xattr -dr com.apple.quarantine "${TARGET_APP}" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Cleared Gatekeeper quarantine flags"

# 5. Create Desktop Shortcut
echo -e "\n${BOLD}[4/4] Creating Desktop Shortcut...${NC}"
DESKTOP_PATH="$HOME/Desktop/Pilothouse"
rm -f "$DESKTOP_PATH"
osascript -e "tell application \"Finder\" to make alias file to POSIX file \"${TARGET_APP}\" at POSIX file \"$HOME/Desktop\"" 2>/dev/null || {
  ln -sf "${TARGET_APP}" "$DESKTOP_PATH"
}
echo -e "${GREEN}✓${NC} Created shortcut at: ${BOLD}${DESKTOP_PATH}${NC}"

# Success Message
echo -e "\n========================================================"
echo -e "${GREEN}${BOLD}✓ INSTALLATION COMPLETE!${NC}"
echo -e "========================================================"
echo -e "You can launch Pilothouse from:"
echo -e "  1. Your Desktop shortcut: ${AMBER}${DESKTOP_PATH}${NC}"
echo -e "  2. Applications folder:   ${AMBER}${TARGET_APP}${NC}"
echo -e "  3. Spotlight Search:      Type 'Pilothouse' and press Enter"
echo ""
echo -e "Enjoy coding with zero friction! ✦"

