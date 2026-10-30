# ⚡ Claude Deck // Terminal Cockpit

<div align="center">

**A bespoke, open-source terminal cockpit and command deck for Claude Code.**

Crafted for developers who want a tactile, hardware-inspired station instead of generic dashboards. Organize your Claude Code repositories, toggle execution flags with tactile switches, inspect live telemetry from `~/.claude.json`, and deploy terminal sessions with a single keypress.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

## 🕹️ Why Claude Deck?

Generic AI dashboards all look the same: cookie-cutter gray cards and standard checkboxes. 

**Claude Deck** is designed with an industrial, tactile developer aesthetic:
- **🎛️ Physical Hardware-Style Switch Matrix**: Rocker toggles with LED status lights (Armed Amber, Emerald, Cyan) for `--dangerously-skip-permissions`, `--continue`, and custom arguments.
- **🔊 Tactile Audio Synthesizer**: Subtle mechanical click sounds synthesized directly via the Web Audio API on toggle and launch.
- **📊 Real Claude Telemetry**: Pulls live data straight from `~/.claude.json` to show actual token usage, last model used (`opus-5-5`, `sonnet-5`), and dollar cost spent per project.
- **⌨️ 100% Keyboard-Driven Studio Layout**: 
  - `[↑ / ↓]` or `[J / K]` to navigate repositories
  - `[SPACE]` to toggle `--dangerously-skip-permissions`
  - `[C]` to toggle `--continue`
  - `[↵ ENTER]` to deploy the terminal session
  - `[⌘O]` to open Finder, `[⌘E]` for VS Code
- **🖥️ Live CRT Command Monitor**: Reactive monospace display showing the exact bash/zsh command that will run in your terminal.
- **📄 Embedded CLAUDE.md & File Inspector**: Instant peek into project memory, guidelines, and repository files without leaving the deck.

---

## 📸 Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚡ Claude Code Launcher                        [🔍 Search projects...] │
│  8 projects configured                          [Sync Claude] [+ Add]  │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────┐             │
│  │ 📁 my-tradebot          │  │ 📁 frontend-app         │             │
│  │ 🌿 main  •  📄 CLAUDE.md│  │ 🌿 dev                  │             │
│  │                         │  │                         │             │
│  │ Launch Flags:           │  │ Launch Flags:           │             │
│  │ [✓] --dangerously-skip  │  │ [✓] --dangerously-skip  │             │
│  │ [✓] --continue (-c)     │  │ [ ] --continue (-c)     │             │
│  │                         │  │                         │             │
│  │ $ claude --dangerously  │  │ $ claude --dangerously  │             │
│  │                         │  │                         │             │
│  │ [📂] [💻] [📄] [Launch] │  │ [📂] [💻] [📄] [Launch] │             │
│  └─────────────────────────┘  └─────────────────────────┘             │
└────────────────────────────────────────────────────────────────────────┘
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
npm install
# or with bun:
bun install
```

### 2. Run in Development Mode

```bash
npm run dev
# or:
bun run dev
```

### 3. Build & Run Desktop App

```bash
npm run build
npm start
```

---

## 📦 Packaging Executables

To create a standalone application bundle for distribution:

### macOS (.app & .dmg):
```bash
npm run dist:mac
```

### Windows (.exe / installer):
```bash
npm run dist:win
```

### Linux (.AppImage / .deb):
```bash
npm run dist:linux
```

The resulting packages will be created in the `release/` directory.

---

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/) + [Vite](https://vitejs.dev/)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Packager**: [electron-builder](https://www.electron.build/)

---

## ⚙️ Configuration & Storage

Project preferences and flag configurations are saved locally at:
- macOS / Linux: `~/.claude-launcher/config.json`
- Windows: `%USERPROFILE%\.claude-launcher\config.json`

This guarantees that your settings, favorite projects, and custom flags persist across application restarts.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/your-username/claude-code-launcher/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

