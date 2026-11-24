# Framecheck

Game requirements and FPS checker, tuned for an ASUS Vivobook (Core 7 150U, Intel Graphics, 8 GB RAM).
Static page plus a small API (Cloudflare Worker compatible).

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs all tests. |
| `npm run build` | Writes `dist/server/index.js` (the Worker with the page inside). |
| `npm run build:portable` | Also writes `Framecheck.html` (works offline, no API). |
| `npm start` | Local server at http://127.0.0.1:4672 (after `npm run build`). |
| `npm run start:accounts` | Like `npm start`, with accounts on a local SQLite file in `.data/` (git-ignored). |
| `npm run deploy` | Tests, builds, applies new database migrations and deploys to Cloudflare (`framecheck-samir`). |

First deploy on a machine, or when the token has expired: run `npx wrangler login` once in a terminal.

## Layout

- `src/index.html`, `src/ui.css`: page template and styles.
- `src/i18n.mjs`: UZ/RU text. `src/data/ru.json` holds the Russian dictionary.
- `src/core.mjs`, `src/profile.mjs`, `src/compat.mjs`: game parsing, device profile, verdicts.
- `src/frames.mjs`: FPS estimates and Steam price parsing. `src/data/steam-uz.json` is the price seed.
- `src/search.mjs`, `src/suggest-ui.mjs`, `src/prices-ui.mjs`, `src/dxdiag.mjs`: search, prices, DxDiag import.
- `src/fps-demo.js`, `src/pc-duel.js`, `src/client.js`: browser-only parts.
- `src/devices.mjs`, `src/device-picker.js`: video card / processor / RAM / system lists and the pick-or-type controls in
  the device dialog. Every listed model must be understood by `gpuClass` / `cpuClass` (a test enforces it).
- `src/settings.mjs`, `src/settings-ui.js`: screen size and graphics quality. FPS numbers are converted from the setting
  they belong to (for example 720p low) to the chosen one; converted numbers are labelled as estimates.
- `src/catalog.json`: 215 games. `src/benchmarks.json`: sourced FPS measurements.
- `src/server.mjs`: `/api/game`, `/api/search`, `/api/prices`, `/img/<id>` (cover proxy).
- `build.mjs`: joins the modules into one page. `import`/`export` lines are stripped for the browser.
- `media/`: offline covers (`<steam id>.jpg`) and the hero image.
- `reference/`: snapshot of the deployed site, kept for comparison.

## Accounts

Sign in / sign up with a login and password; saved games, history and the device profile sync across devices.
The site works without an account.

- Storage: Cloudflare D1 database `framecheck-db` (binding `DB` in `wrangler.toml`). Schema: `migrations/`.
  Add new schema changes as a new numbered `.sql` file; `npm run deploy` applies them.
- Passwords: only salted PBKDF2-SHA256 hashes are stored. Sessions: HttpOnly cookie, only its hash is stored.
  There is no password recovery (no email). The owner can delete a user row in D1 if someone is locked out.
- Server code: `src/auth.mjs` (routes, hashing, rate limits), `src/sync.mjs` (document rules, shared with the browser).
- Browser code: `src/account.js` (dialogs, sync loop). Sync never runs without a signed-in user.
- Without a database (file://, plain `npm start`) the account buttons are hidden.
- Look at the data: `npx wrangler d1 execute framecheck-db --remote --command "SELECT username, created_at FROM users"`.

### Admin panel
Register an account on the site first, then make it an admin from your computer (the site itself can never grant this):

```powershell
npx wrangler d1 execute framecheck-db --remote --command "UPDATE users SET is_admin = 1 WHERE username = 'YOUR_LOGIN'"
```

Admins get an "Admin panel" button in the account dialog: totals, most checked/saved games, common devices, FPS report review,
and for each user a one-time temporary password (for people locked out) or deletion. Passwords and emails are never shown.

### Password recovery by email (optional, off by default)
The link is sent through [Resend](https://resend.com). It needs a verified sending domain. Then:

```powershell
npx wrangler secret put RESEND_API_KEY
```

and add `MAIL_FROM` (for example `Framecheck <no-reply@your-domain>`) under `[vars]` in `wrangler.toml`. Until both exist the
email field and the "Forgot password?" link stay hidden. Reset links last 30 minutes and work once.

### FPS reports from users
Signed-in users can send one FPS measurement per game. It appears for everyone only after an admin approves it.

## Addresses
- Main address: **https://framecheck.uk**. `www.framecheck.uk` redirects to it (308). The site answers on no other address.
  The list lives in `wrangler.toml` (`CANONICAL_HOST`, `REDIRECT_HOSTS`); the rule is `canonicalRedirect` in `src/server.mjs`.
- The old `framecheck-samir.ruzmatvv.workers.dev` is switched off (`workers_dev = false`): the Worker is not started for that
  address, so nothing is counted against the free request limit. Set it to `true` to bring it back.
- Cloudflare creates the DNS records and certificates for the custom domains on deploy. A brand-new `.uk` name can take a few
  minutes before HTTPS answers.

## Installable app
`npm run build` also produces the manifest, icons and `sw.js`. The service worker serves the last copy of the page offline and
caches covers; `/api` requests are never cached. The version inside `sw.js` follows the page, so every deploy refreshes it.

## Notes

- Covers load from the Steam CDN. If that fails, other CDN hosts are tried, then `/img/<id>.jpg` on this server.
- Only real, sourced numbers belong in `benchmarks.json`.
- `portable.py` is the fallback when Node is missing. It mirrors the same API routes.
