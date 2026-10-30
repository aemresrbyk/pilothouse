# ⚡ Claude Code Launcher // Terminal Cockpit

<div align="center">

**A sleek, Google Chrome-tabs powered desktop cockpit and launcher for Claude Code CLI.**

Designed specifically for developers who manage multiple Claude Code repositories in parallel. Switch between project terminals via tabs, toggle `--dangerously-skip-permissions` with a click, compile custom flags in real-time, inspect files directly in the app, and dispatch sessions to your favorite terminal emulator.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

## 🎛️ Key Features & Architecture

- **🌐 Google Chrome-Style Project Tabs**:
  - Seamlessly switch between multiple Claude Code repositories (`[ ⚡ my-project ✕ ] [ ⚡ api-server ✕ ] [ + ]`).
  - Native tab management with shortcuts (`⌘1-9`, `⌘T` for new tab, `⌘W` to close tab).
  - Open project tabs remain persistent across app restarts.
- **🔍 Smart Omnibar with Live Command Compilation**:
  - Type extra flags, custom prompt text, or Claude commands (e.g. `--worktree feat`, `-p "fix auth tests"`, `/doctor`).
  - Interactive dropdown autocomplete with history recall (Arrow Up/Down).
  - Real-time compiled command preview:
    ```bash
    $ cd "/Users/username/my-project" && claude --dangerously-skip-permissions -p "fix auth tests"
    ```
- **🛡️ Prominent Flag Switches**:
  - `[● --dangerously-skip-permissions]`: One-click toggle so Claude executes without constant permission prompts.
  - `[● --continue (-c)]`: Quickly resume the most recent conversation.
  - Quick pills for `--chrome`, `--verbose`, `--bare`, `/doctor`, `/init`, `--worktree`.
- **💻 Native Multi-Terminal Dispatching**:
  - Launch directly into **macOS Terminal**, **iTerm2**, **Ghostty**, **Warp**, **Alacritty**, **Kitty**, **Windows Terminal (wt)**, or **VS Code**.
  - One-click terminal emulator switcher right in the Omnibar and Workspace.
- **📂 In-App File Explorer & Code Viewer**:
  - Inspect repository files and read code directly inside the application with line counts and syntax view.
  - One-click action to copy file contents, reveal in Finder, or edit in VS Code / Cursor.
- **📜 Session Telemetry & One-Click Resume**:
  - Discovers past session histories (`.jsonl`) from `~/.claude/projects/` and allows 1-click `--resume <session-id>`.
  - Shows tokens, model usage (Sonnet 3.7, Opus 3.5), and session costs.
- **📁 Drag & Drop Folder Detection**:
  - Drag any folder from Finder directly into the window to register it and open a new tab immediately.
- **⌨️ Spotlight Command Palette**:
  - Press `⌘P` or `⌘K` anywhere to quickly fuzzy search repositories and open them (`↵` to view, `⌘↵` to open in new tab).

---

## 📸 Workspace Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [● ⚡ my-app ✕] [● ⚡ api-gateway ✕] [● ⚡ auth-service ✕]  [+]     [🔊] [⚙] [Sync]│
├──────────────────────────────────────────────────────────────────────────────────┤
│ ❯ /Users/alice/my-app  |  claude --dangerously-skip-permissions -p "run tests" ↵ │
│ [● --dangerously-skip-permissions] [○ --continue] [Terminal ▾]       [▶ RUN]     │
│ $ cd "/Users/alice/my-app" && claude --dangerously-skip-permissions               │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 🌿 main #a1b2c3d  •  $4.20  •  sonnet-3-7  │ [Terminal] [Files] [Sessions] [CLAUDE]│
│                                                                                  │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ ● TERMINAL DISPATCH MONITOR                                TARGET: Terminal  │ │
│ │                                                                              │ │
│ │ // Directory ready for dispatch:                                             │ │
│ │ $ cd "/Users/alice/my-app"                                                   │ │
│ │                                                                              │ │
│ │ // Active Claude Code execution command:                                     │ │
│ │ > claude --dangerously-skip-permissions -p "run tests"                       │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│ [                     ▶ LAUNCH CLAUDE CODE IN TERMINAL (↵)                     ] │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ⌘P Quick Find  |  ⌘T New Tab  |  ⌘W Close Tab  |  ⌘1-9 Switch Tab  |  ↵ Run      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (or [Bun](https://bun.sh))
- Claude Code CLI installed (`claude` in your PATH or `~/.local/bin/claude`)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/claude-code-launcher.git
cd claude-code-launcher
bun install # or npm install
```

### 2. Development Mode

```bash
bun run dev # or npm run dev
```

### 3. Production Build & Run

```bash
bun run build
bun run start
```

---

## 📦 Packaging Standalone Executables

To package standalone binaries for desktop distribution:

### macOS (.app & .dmg):
```bash
bun run pack       # Builds release/mac-arm64/Claude Code Launcher.app
bun run dist:mac   # Builds release/Claude Code Launcher.dmg
```

### Windows (.exe / portable):
```bash
bun run dist:win
```

### Linux (.AppImage / .deb):
```bash
bun run dist:linux
```

---

## ⚙️ Configuration & Data Persistence

User configurations, recent commands, flag preferences, and active tab states are stored locally at:
- **macOS / Linux**: `~/.claude-launcher/config.json`
- **Windows**: `%USERPROFILE%\.claude-launcher\config.json`

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
