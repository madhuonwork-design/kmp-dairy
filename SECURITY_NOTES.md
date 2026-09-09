# FarmOS security review — findings & what to do next

## Bottom line
No web app is "flawless" or fully "data-steal-proof" — anyone who claims that is overselling it. What I did instead: found the real gap, closed what's closeable on the client, and gave you the one server-side change that actually matters. Do the steps in **"Required — do this now"** and this app will be genuinely hard to get into, not just password-decorated.

## The core problem (critical)
The login screen in `index.html` only ran in the visitor's browser. Your Apps Script URL and its `getAll` / `saveAll` / `upsert` / `delete` actions had no server-side check — anyone who copied the URL out of the page source could read or overwrite your farm's entire Google Sheet without ever seeing the login form. A client-side password check can't protect data that a public, unauthenticated backend will hand out to anyone who asks.

## What was changed in `index.html`
- **Content-Security-Policy** meta tag added — restricts where scripts/styles/connections can come from, so even a future injection bug can't phone data out to an attacker's server.
- **Removed the plaintext default password** (`KMPDairy@2026`) that was sitting in a comment in the shipped file — that's a live credential, handed to anyone who viewed source. Treat it as burned.
- **Login attempt lockout** — 5 failed tries triggers a 60s wait, doubling on repeat abuse. (Caveat below.)
- **Consistent output escaping** on a few date/type fields that weren't going through `esc()`.
- **Real session tokens**: login now calls the Apps Script `login` action, which independently re-checks the password and issues a random token. Every `getAll`/`saveAll`/`upsert`/`delete` call now sends that token, and the app forces re-login if the server ever rejects it as unauthorized.

## Required — do this now
1. **Rotate the password.** Run `await sha256Hex("yourNewStrongPassword")` in the browser console, and set the result as `ADMIN_PASSWORD_HASH` in your Apps Script's Script Properties (not in the HTML — see `Code.gs`).
2. **Deploy `Code.gs`.** Merge the template I wrote with your existing sheet read/write functions (`readAllSheets`, `saveAllSheets`, etc. — I don't have your actual implementations, only the client that calls them). This is the piece that makes the login real: the token check happens here, before any Sheet is touched.
3. **Redeploy to a new URL** (Deploy → Manage deployments → New deployment, not just "new version"). Your current `API_URL` was in a file that's now been shared — treat it as exposed and get a fresh one.
4. Until step 2 is live, login will fail with a clear "server not updated yet" message rather than silently falling back to the old insecure behavior — that's intentional (fail closed, not open).

## Known limitations, stated plainly
- **Write requests (`saveAll`/`upsert`/`delete`) use a hidden-iframe form POST**, a workaround from older Apps Script CORS behavior. It can't read the server's response, so if a write is rejected as unauthorized, the client won't know *immediately* — it'll catch it within 15s on the next periodic sync (which does check). If you want instant feedback, the real fix is switching those calls to `fetch()` — worth doing but a bigger change I didn't make unprompted.
- **The client-side lockout is easy to bypass** (clear `localStorage` / open a private window) — it's friction, not a real rate limit. A genuine rate limit needs to live in Apps Script (e.g., tracking failed attempts per IP isn't available in Apps Script, but you can cap login attempts per token-bucket in `CacheService` keyed by username).
- **`CacheService`-based tokens** can theoretically be evicted a little early under load; fine for one farm's usage, noted in `Code.gs` if you want the stricter alternative.
- Real remaining risks no code change fixes: someone gaining access to the Google account that owns the Apps Script project, a device left logged in and unlocked, or the password being reused/guessed. Those are operational, not code, problems.

## Files
- `index.html` — hardened client
- `Code.gs` — server-side auth template to merge into your Apps Script project
