# ⚡ Claude Code Launcher

<div align="center">

**A sleek, open-source desktop launcher and project manager for the Claude Code CLI.**

Organize your Claude Code repositories, configure flags like `--dangerously-skip-permissions`, inspect files & `CLAUDE.md`, and launch interactive terminal sessions with a single click.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

## ✨ Features

- ⚡ **One-Click Terminal Launch**: Click a project to immediately open your terminal navigated to the directory and executing `claude` with your desired flags.
- 🛡️ **Interactive Command Flags**:
  - `[✓] --dangerously-skip-permissions` (Bypass repetitive permission prompts)
  - `[ ] --continue` (`-c` resume the latest conversation in that directory)
  - `[ ] --chrome` (Enable Claude in Chrome browser integration)
  - `[ ] --verbose` (Enable detailed debug logs)
  - Custom flags & prompt arguments (e.g. `--worktree feature-x` or custom prompt)
- 🔍 **Auto-Discovery of Existing Projects**: Automatically scans `~/.claude.json` to discover all projects you have ever used with Claude Code.
- 📄 **Instant `CLAUDE.md` Viewer**: View and edit project guidelines, rules, and memory files with one click.
- 📂 **Built-in File Browser**: Inspect project directory tree, file sizes, and preview code and configs directly inside the app.
- 🌿 **Git Integration**: Live detection of git repositories and current branch names.
- 💻 **IDE & Finder Shortcuts**: Quick buttons to open the repository in **VS Code**, **Cursor**, or **Finder / File Explorer**.
- 🖥️ **Multiple Terminal Support**: Compatible with macOS **Terminal.app**, **iTerm2**, **Ghostty**, **Warp**, **Alacritty**, and Windows Terminal / Linux terminals.
- 🎨 **Minimal & Modern UI**: Sleek dark interface inspired by Anthropic aesthetic and Linear simplicity.

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

