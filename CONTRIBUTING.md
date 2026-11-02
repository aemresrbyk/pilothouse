# Contributing

Thanks for wanting to help!

- **Bugs and ideas:** open an issue with the templates.
- **Code:** fork, create a branch, open a pull request. Small, focused PRs are
  easiest to review.

## Run it locally

```bash
git clone https://github.com/aemresrbyk/pilothouse.git
cd pilothouse
npm install          # or: bun install
npm run dev          # app with live reload
npm run typecheck    # must pass before a PR
```

Voice prompts need the Whisper binary: `npm run build:whisper` (macOS).

## Style

- TypeScript, React 19, Tailwind.
- Keep user-facing text short and plain.
- All agent flags start **off** by default; don't change that.
