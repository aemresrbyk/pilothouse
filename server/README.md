# Pilothouse server

Pilothouse without the window: coding agents run in terminals on a server (a Linux box, a VPS, a Mac mini), and you
watch and answer them from **[usepilothouse.com/app](https://usepilothouse.com/app/)** or the Pilothouse iPhone app.
No account, no Tailscale needed: everything between your browser and the server is end-to-end encrypted through the
Pilothouse relay, which only passes sealed messages along.

## Run

Needs Node 22+ and the agent CLIs you use (Claude Code, Codex, Gemini CLI, opencode …), signed in on the server.

```sh
git clone https://github.com/aemresrbyk/pilothouse && cd pilothouse
bun install && bun run build:server
cd server && npm install
node dist/pilothouse-server.mjs ~/code/api ~/code/web     # the project folders to offer
```

It prints a QR code and a link. Scan it with your phone, or open the link in a browser: that browser is paired
(once; the code expires after 10 minutes). Press Enter for a new code. Pick the agent with
`PILOTHOUSE_AGENT=codex` (default: Claude Code). Keep it running with `tmux`, `systemd` or `pm2`.

Everything you do is logged to `~/.pilothouse/remote-audit.jsonl`; paired devices live in `~/.pilothouse/remote.json`.
