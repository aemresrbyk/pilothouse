<div align="center">

  <img src="public/logo.svg" alt="Claude Code Launcher Logo" width="108" height="108" />

  # Claude Code Launcher
  ### Supercharged Desktop Cockpit & Embedded Terminal for Claude Code CLI

  **A bespoke, Google Chrome-tabs powered developer workstation and native interactive terminal for Claude Code.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
  [![Author](https://img.shields.io/badge/Author-aemresrbyk-181717?logo=github&logoColor=white)](https://github.com/aemresrbyk)
  [![macOS Apple Silicon & Intel](https://img.shields.io/badge/Platform-macOS%20(arm64%20%7C%20x64)-black?logo=apple&logoColor=white)](#-quick-install-macos)
  [![Electron](https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

## ⚡ 1-Line Quick Install (macOS)

Open your macOS Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/aemresrbyk/claude-code-launcher/main/install.sh | bash
```

> **What this does:**
> - Detects your Apple Silicon (`arm64`) or Intel (`x64`) architecture.
> - Installs `Claude Code Launcher.app` directly into `/Applications`.
> - Removes macOS Gatekeeper quarantine flags so it opens without security blocks.
> - Creates a desktop alias at `~/Desktop/Claude Code Launcher`.

---

## 💡 Why Use Claude Code Launcher? (Key Reasons)

While Claude Code CLI is a brilliant coding agent, running it in a standard terminal leads to repetitive friction. **Claude Code Launcher** solves these pain points:

1. **🛡️ Zero Interruption Workflow (`--dangerously-skip-permissions`)**:
   - Tired of typing `y` to approve 50 bash commands and file writes?
   - Toggle `--dangerously-skip-permissions` with one click or keep it permanently active per project.
2. **🌐 Google Chrome-Style Multi-Terminal Tabs (`⌘T` / `⌘1-9`)**:
   - Work on 5 repositories simultaneously without messy separate terminal windows.
   - Switch instantly between project tabs with `⌘1` through `⌘9`.
   - Open multiple tabs for the *same* repository (e.g. `Tab 1: claude agent`, `Tab 2: bun run dev`).
3. **⚡ 1-Click Slash Commands & Prompt Presets Bar**:
   - Trigger essential Claude routines with single-click pills:
     - `/doctor` (Check health & MCP connections)
     - `/compact` (Compact session context)
     - `/init` (Initialize project config)
     - `/cost` (Inspect token usage and session expenses)
     - `Review Git Diff` (Claude reviews uncommitted git changes)
     - `Find Bugs` (Scan code for regressions and edge cases)
     - `Write Tests` (Generate unit tests for recent changes)
4. **📄 Smart CLAUDE.md Generator & In-App Live Editor**:
   - `CLAUDE.md` is Claude Code's memory and rulebook.
   - If missing: 1-click **"✦ Generate Smart CLAUDE.md"** detects your stack (TypeScript, Bun, Node, Python, Rust) and writes project rules.
   - If present: live in-app editor with **Save Changes (⌘S)** directly to disk.
5. **📝 Integrated Prompt Drafter & Scratchpad**:
   - While Claude is generating code, draft your next multi-line prompt, paste API logs, or save snippets in the built-in scratchpad.
   - Hit **"Send ↵"** to dispatch the drafted prompt directly to the active terminal.
6. **🌿 Live Git Insights & Modified Files Badge**:
   - Shows current Git branch and uncommitted modified file count (`● 3 modified`).
   - One-click trigger to have Claude review your diff before committing.
7. **🎨 5 Curated Developer Themes**:
   - **🔥 Anthropic Warm** (Warm charcoal, terracotta amber, parchment text)
   - **🌑 OLED Pure Black** (Pure black `#000000`, high contrast monochrome)
   - **⚡ Cyber Slate** (Deep slate navy, cyan/sky accents)
   - **❄️ Nord Frost** (Arctic ice & cool gray-blue)
   - **☀️ Paper Minimal** (Clean crisp light mode)
8. **🖥️ In-App Embedded Terminal (`node-pty` + `@xterm/xterm`)**:
   - Fully embedded terminal emulator with full ANSI truecolor, mouse selection, copy (`⌘C`), paste (`⌘V`), and scrollback. No external Terminal popups.

---

## 📸 Workspace Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [●] [●] [●] ✦ [shorts ✕] [befass ✕] [kitefold ✕] [+] [📁]           [🔥 Anthropic ▾] [⚙]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ❯ shorts  🌿 main • 2 modified | [● --dangerously-skip-permissions] [--continue] [▶ Run]│
│                                [ >_ Terminal ]  [ 📄 CLAUDE.md ]  [ 📂 Files ]  [📝]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ QUICK: [/doctor] [/compact] [/init] [/cost] [Review Diff] [Find Bugs] [Write Tests]    │
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
│ ⌘P Find  |  ⌘T Tab  |  ⌘W Close  |  ⌘1-9 Switch Tab    ● Claude Ready • 3 SESSIONS • 🔥│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `⌘T` | **New Tab / Project Picker** | Opens search modal or creates new project tab |
| `⌘P` / `⌘K` | **Command Palette** | Quick search indexed repositories & actions |
| `⌘W` | **Close Tab** | Closes active terminal session safely |
| `⌘1` – `⌘9` | **Switch Tab** | Instantly switches between active sessions |
| `⌘C` | **Copy** | Copies selected text from terminal or preview |
| `⌘V` | **Paste** | Pastes clipboard text directly into PTY stream |
| `Enter` | **Run Omnibar** | Executes current prompt in active Claude terminal |

---

## 🛠️ Build From Source

### Prerequisites
- Node.js 18+ or [Bun](https://bun.sh) (recommended)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Setup & Run

```bash
# 1. Clone repository
git clone https://github.com/aemresrbyk/claude-code-launcher.git
cd claude-code-launcher

# 2. Install dependencies
bun install   # or npm install

# 3. Development mode (with live reload)
bun run dev   # or npm run dev

# 4. Build application bundle & DMG
bun run build
bun run dist:mac
```

Pre-packaged `.dmg` and `.zip` files will be placed in the `release/` folder.

---

## 📦 Open Source Releases & CI/CD

This repository includes a fully automated GitHub Actions workflow (`.github/workflows/build-and-release.yml`):
- Automatically builds native `.dmg` and `.zip` installers for **macOS Apple Silicon (`arm64`)** and **Intel (`x64`)**.
- Releases are attached to GitHub Release tags (`v*`).

---

## 📄 License & Credits

- Created and maintained with ❤️ by **[Ali Emre Sarıbıyık (aemresrbyk)](https://github.com/aemresrbyk)**.
- Licensed under the **[MIT License](LICENSE)**. Open source and free for the developer community.
