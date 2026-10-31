<div align="center">

  <img src="public/logo.svg" alt="Electron logo" width="108" height="108" />

  # Electron
  ### Desktop cockpit with tabbed, embedded terminals for Claude Code

  [![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
  [![Author](https://img.shields.io/badge/Author-aemresrbyk-181717?logo=github&logoColor=white)](https://github.com/aemresrbyk)
  [![Platform](https://img.shields.io/badge/Platform-macOS%20(arm64%20%7C%20x64)-black?logo=apple&logoColor=white)](#quick-install-macos)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

> **Name note:** this app is called *Electron* and is built **with** the [Electron framework](https://www.electronjs.org/), but it is an independent project and not affiliated with or endorsed by the OpenJS Foundation or the Electron project.

Electron keeps all your Claude Code projects in one window: every project gets its own real terminal tab (`node-pty` + `xterm.js`) that starts `claude` with the flags you choose. You can switch between projects with `⌘1-9`, edit `CLAUDE.md`, browse files and send prompts without leaving the app.

---

## Quick install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/aemresrbyk/electron/main/install.sh | bash
```

The installer:
- picks the right build for Apple Silicon (`arm64`) or Intel (`x64`),
- installs `Electron.app` into `/Applications`,
- clears the Gatekeeper quarantine flag (the app is not code-signed),
- puts an `Electron` alias on your Desktop.

If you run `./install.sh` inside a clone, it builds from source instead of downloading.

---

## Features

- **Tabbed embedded terminals.** Each tab runs a login shell in the project folder and starts Claude automatically. You can open several tabs for the same project (e.g. one for Claude, one for `npm run dev`). Open tabs come back when you restart the app.
- **Per-project flags.** Toggle `--dangerously-skip-permissions` and `--continue`, or add any extra flags/prompt in the input bar. **Run** restarts the session with the current command.
- **Quick actions.** One-click `/doctor`, `/compact`, `/init`, `/cost`, plus "Review Git Diff", "Find Bugs" and "Write Tests" prompts sent to the running Claude session.
- **Conversation history.** Claude Code saves every conversation. The **History** view lists a project's previous sessions by their first prompt, and one click reopens a session in the tab with `claude --resume`.
- **CLAUDE.md editor.** View and edit the project's `CLAUDE.md` in the app, or start from a template if the project doesn't have one.
- **File browser.** Browse project folders and preview files (large files are truncated, open them in your editor for the full content).
- **Prompt drafter.** A per-project scratchpad for multi-line prompts, sent to the terminal with one click.
- **Git badge.** Shows the current branch and the number of modified files.
- **Project discovery.** On first run, imports the projects Claude Code already knows about (`~/.claude.json`). Use the sync button to pick up new ones later. You can add folders with the picker, by typing a path, or by drag & drop.
- **5 themes.** Anthropic Warm, OLED Black, Cyber Slate, Nord Frost, Paper Minimal.

> ⚠️ New projects start with `--dangerously-skip-permissions` **on**, which means Claude runs tools without asking you first. You can turn it off for each project in the control bar, or change the default in Settings.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘T` | Open the project picker in a new tab |
| `⌘P` / `⌘K` | Command palette: search, open, or remove projects |
| `⌘W` | Close the active tab |
| `⌘1` – `⌘9` | Switch tabs |
| `⌘C` / `⌘V` | Copy selection / paste (bracketed paste, so multi-line pastes don't submit early) |
| `Enter` in the input bar | Restart Claude with the current flags + input |

On Windows/Linux, use `Ctrl` instead of `⌘`.

---

## Build from source

Requirements: Node.js 18+ (or [Bun](https://bun.sh)) and the Claude Code CLI (`npm install -g @anthropic-ai/claude-code`).

```bash
git clone https://github.com/aemresrbyk/electron.git
cd electron
npm install          # or: bun install
npm run dev          # development mode with live reload
npm run build        # type-check + production bundle
npm run dist:mac     # .dmg / .zip into release/
```

Settings and the project list are stored in `~/.electron-app/config.json`. Configs from older versions (`~/.claude-launcher`) are migrated automatically.

---

## Releases

`.github/workflows/build-and-release.yml` builds macOS `arm64` and `x64` packages on every push to `main`. When you push a `v*` tag, it attaches `Electron-<arch>-mac.zip` / `.dmg` to a GitHub Release.

---

## License

MIT, made by **[Ali Emre Sarıbıyık (aemresrbyk)](https://github.com/aemresrbyk)**.
