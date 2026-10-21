# Contributing

Thanks for helping. Cloudflare Free is a website and installable app built only from Cloudflare's free tier, so every change has to keep it free.

## Ground rules

- The repo root holds only `README.md`, `app/` and `docs/`, so the README shows first on GitHub. Please don't add anything there.
- Code goes in `app/`, where npm commands run. Writing goes in `docs/`.

## Setup

You need Node.js 22.18 or newer; 24 is recommended.

```bash
cd app
npm install
npm run setup
npm run dev
```

Then open http://localhost:5173. [Run it locally](../README.md#run-it-locally) in the README explains what works without a Cloudflare account.

## Before you open a pull request

- Run `npm run check` in `app/`. It typechecks, runs the tests and builds, and it must pass.
- If the UI changed, retake the README pictures: with `npm run dev` and `npm run demo` running, run `npm run readme:images`.
- If a diagram changed, edit its JSON in `docs/diagrams` and redraw its page in `app/public/learn` with [Archify](https://github.com/tt-a1i/archify). Then run `npm run diagrams:brand` and `npm run diagrams:images`.
- Never edit pictures by hand. The scripts make every one of them, in light and dark.

## The free-tier rule

Every feature must stay inside Cloudflare's free allowances. When you add a Cloudflare product or change how the project uses one:

- update its row in [`app/src/shared/catalog.ts`](../app/src/shared/catalog.ts), which feeds the scoreboard
- update the budget table in [Staying inside the free allowances](../README.md#staying-inside-the-free-allowances)

## Example people and demo data

Example people and demo data use the cast of HBO's *Silicon Valley*: Richard, Erlich, Gilfoyle, Dinesh, Jared, Monica and the rest. The demo community lives in [`app/scripts/seed-demo.mjs`](../app/scripts/seed-demo.mjs). Write new lines for them rather than quoting the show.

## Security problems

Report security problems as [SECURITY.md](SECURITY.md) describes, never in a public issue.
