# Contributing

Thanks for wanting to help!

- **Bugs and ideas:** open an issue with the templates.
- **Code:** fork, create a branch, open a pull request. Small, focused PRs are
  easiest to review.
- **Finding your way:** [ARCHITECTURE.md](ARCHITECTURE.md) shows how the pieces fit and which file does what.

## Run it locally

```bash
git clone https://github.com/aemresrbyk/pilothouse.git
cd pilothouse
npm install          # or: bun install
npm run dev          # app with live reload
npm run typecheck    # must pass before a PR
bun tests/selfcheck.ts   # unit checks, must pass
bun tests/ui-smoke.ts    # opens the built app and clicks through it (run npm run build first)
```

Voice prompts need the Whisper binary: `npm run build:whisper` (macOS).

Other parts of the repo: `mobile/ios` (iPhone app, SwiftUI; see its README), `relay` (Cloudflare Worker), `server` (headless Pilothouse), `electron/remotePage.ts` (the web app; `bun scripts/build-web-app.ts` writes it into the site repo).

Translations live in `src/i18n`: one file per language, keyed by the English text exactly as the app shows it. Fixes from native speakers are very welcome; a new string only needs adding to each file.

## Style

- TypeScript, React 19, Tailwind.
- Keep user-facing text short and plain. Static text in components is translated automatically when it has an entry in `src/i18n`; text built in code (toasts) goes through `t('…')`.
- All agent flags start **off** by default; don't change that.
