# ⚡ Claude Code Launcher // Embedded Desktop Terminal

<div align="center">

**A bespoke, Google Chrome-tabs powered desktop cockpit and live interactive terminal for Claude Code CLI.**

Designed specifically for developers who manage multiple Claude Code repositories in parallel. Switch between project terminals via tabs, toggle `--dangerously-skip-permissions` with a click, compile custom flags in real-time, inspect files directly in the app, and run Claude Code right inside an embedded, high-performance terminal.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-aemresrbyk-181717?logo=github&logoColor=white)](https://github.com/aemresrbyk)
[![Electron](https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

## 🎛️ Key Features & Architecture

- **🖥️ In-App Embedded Terminal (`node-pty` + `xterm.js`)**:
  - No external terminal app is needed. The app itself is an interactive terminal emulator.
  - Claude Code runs directly inside each tab with full ANSI colors, syntax rendering, keyboard interaction, and scrollback.
  - Session preservation: switching between tabs keeps background terminal processes and Claude streams active without resetting.
- **🌐 Google Chrome-Style Project Tabs**:
  - Seamlessly switch between multiple Claude Code repositories (`[ ⚡ my-project ✕ ] [ ⚡ api-server ✕ ] [ + ]`).
  - Native tab management with shortcuts (`⌘1-9`, `⌘T` for new tab, `⌘W` to close tab).
  - Clean titlebar layout with protected macOS traffic lights spacing (no overlapping window buttons).
- **🎨 5 Built-in Themes (Theme Engine)**:
  - **🔥 Anthropic Warm** (Warm charcoal, terracotta amber, parchment text)
  - **🌑 OLED Pure Black** (Pure black `#000000`, minimal monochrome)
  - **⚡ Cyber Slate** (Deep slate navy, cyan/sky accents)
  - **❄️ Nord Frost** (Arctic ice & cool gray-blue)
  - **☀️ Paper Minimal** (Clean crisp light mode)
- **🛡️ Instant Flag Switches & Omnibar**:
  - `[● --dangerously-skip-permissions]`: One-click toggle so Claude executes without permission prompts.
  - `[● --continue (-c)]`: Quickly resume the most recent conversation.
  - Custom input for typing extra prompts or flags (`-p "fix bugs"`, `--worktree feat`).
  - Dedicated control actions: `Run / Restart`, `^C Interrupt`, `Clear`, `Open in VS Code`, and `Reveal in Finder`.
- **📂 In-App File Explorer & CLAUDE.md Viewer**:
  - Switch between `Terminal`, `CLAUDE.md`, and `Files` tabs.
  - Inspect repository files and read code directly inside the application with line counts and syntax view.
- **📁 Drag & Drop Folder Detection**:
  - Drag any folder from Finder directly into the window to register it and open a new tab immediately.
- **⌨️ Spotlight Command Palette**:
  - Press `⌘P` or `⌘K` anywhere to quickly fuzzy search repositories and open them (`↵` to view, `⌘↵` to open in new tab).

---

## 📸 Workspace Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [●] [●] [●]   [⚡ my-app ✕] [⚡ api-gateway ✕] [⚡ auth ✕]  [+]   [🔥 Anthropic ▾] [⚙] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ❯ my-app  🌿 main | [● --dangerously-skip-permissions] [--continue] [Prompt...] [▶ Run]│
│                     [ >_ Terminal ]  [ 📄 CLAUDE.md ]  [ 📂 Files ]   [^C] [Clear]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   ╭──────────────────────────────────────────────────────────────────────────────╮     │
│   │ > claude --dangerously-skip-permissions                                      │     │
│   │                                                                              │     │
│   │ Welcome to Claude Code.                                                      │     │
│   │ How can I help you today?                                                    │     │
│   │                                                                              │     │
│   │ > ▋                                                                          │     │
│   ╰──────────────────────────────────────────────────────────────────────────────╯     │
│                                                                                        │
│                      [ Interactive Embedded Xterm Canvas ]                             │
│                                                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⌘P Find  |  ⌘T Tab  |  ⌘W Close  |  ⌘1-9 Switch Tab              3 SESSIONS ACTIVE • 🔥│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (or [Bun](https://bun.sh))
- Claude Code CLI installed (`claude` in your PATH or `~/.local/bin/claude`)

### 1. Clone & Install

```bash
git clone https://github.com/aemresrbyk/claude-code-launcher.git
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

User configurations, recent commands, flag preferences, themes, and active tab states are stored locally at:
- **macOS / Linux**: `~/.claude-launcher/config.json`
- **Windows**: `%USERPROFILE%\.claude-launcher\config.json`

---

## 👤 Author

**Ali Emre Sarıbıyık (aemresrbyk)**
- GitHub: [@aemresrbyk](https://github.com/aemresrbyk)

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
