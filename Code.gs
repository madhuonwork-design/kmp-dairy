/**
 * KMP FarmOS — Apps Script backend with SERVER-SIDE session auth.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The HTML client can only ask nicely — it cannot enforce anything,
 * because every line of its JavaScript is visible to whoever opens
 * the page. The ONLY place that can actually stop an unauthenticated
 * request is here, in Apps Script, before any Sheet is touched.
 *
 * This template adds:
 *   - A 'login' action that checks username + SHA-256(password) against
 *     credentials stored in Script Properties (NOT in the HTML file).
 *   - A random session token issued on successful login, stored server-
 *     side with an expiry.
 *   - A checkToken() gate that every other action (getAll, saveAll,
 *     upsert, delete) must pass before touching the spreadsheet.
 *
 * HOW TO ADOPT THIS
 * ------------------
 * 1. Open your existing Apps Script project (script.google.com).
 * 2. In Project Settings > Script Properties, add:
 *      ADMIN_USERNAME = admin
 *      ADMIN_PASSWORD_HASH = <sha256 hex of a new strong password>
 *        (get this by running `await sha256Hex("yourNewPassword")`
 *         in the browser console on the FarmOS page)
 * 3. Merge the doGet/doPost routing below with your existing sheet-
 *    reading/writing logic — keep your actual getAll/saveAll/upsert/
 *    delete implementations, just wrap them with requireAuth() as
 *    shown, and add the 'login' branch.
 * 4. Deploy > Manage deployments > New version, so the URL now runs
 *    this code. (The URL itself doesn't need to change, but see the
 *    note below about rotating it anyway.)
 * 5. Only THEN update index.html's AUTH_USERS hash to match the new
 *    password, and open the page to log in.
 *
 * ALSO DO THIS: since your old Apps Script URL and default password
 * were exposed in a shared file, treat both as compromised. Rotate
 * the password (step 2) regardless of whether you also redeploy to a
 * new URL. Redeploying as a "new deployment" (not "new version") will
 * also give you a fresh URL, which is worth doing since the old one
 * may already be recorded somewhere outside your control.
 */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // must match SESSION_HOURS in index.html
const TOKEN_STORE = CacheService.getScriptCache(); // simplest option; see note below

function doGet(e) {
  return handle(e.parameter, e.parameter.callback);
}

function doPost(e) {
  const payload = JSON.parse(e.parameter.payload || '{}');
  return handle(payload, null);
}

function handle(params, callback) {
  let result;
  try {
    result = route(params);
  } catch (err) {
    result = { ok: false, error: String(err.message || err) };
  }
  const json = JSON.stringify(result);
  if (callback) {
    // JSONP response for GET/login/getAll
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function route(p) {
  const action = p.action;

  if (action === 'login') {
    return doLogin(p.u, p.h);
  }

  // Every other action requires a valid, unexpired token.
  if (!checkToken(p.token)) {
    return { ok: false, error: 'Unauthorized' };
  }

  switch (action) {
    case 'getAll':   return { ok: true, data: readAllSheets() };        // <- your existing read logic
    case 'saveAll':  saveAllSheets(p.data);   return { ok: true };      // <- your existing write logic
    case 'upsert':   upsertRecord(p.store, p.record); return { ok: true };
    case 'delete':   deleteRecord(p.store, p.id);     return { ok: true };
    default:         return { ok: false, error: 'Unknown action' };
  }
}

function doLogin(username, hash) {
  const props = PropertiesService.getScriptProperties();
  const expectedUser = props.getProperty('ADMIN_USERNAME');
  const expectedHash = props.getProperty('ADMIN_PASSWORD_HASH');

  if (!expectedUser || !expectedHash) {
    return { ok: false, error: 'Server not configured: set ADMIN_USERNAME / ADMIN_PASSWORD_HASH in Script Properties.' };
  }
  // Constant-time-ish comparison isn't critical here since this isn't a
  // network timing side channel worth defending against for a small
  // farm tool, but exact match is required.
  if (String(username).toLowerCase() !== expectedUser.toLowerCase() || hash !== expectedHash) {
    // Deliberately vague error — don't reveal whether the username or
    // password was the wrong part.
    return { ok: false, error: 'Invalid user ID or password.' };
  }

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  TOKEN_STORE.put('tok_' + token, JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS }), TOKEN_TTL_MS / 1000);
  return { ok: true, token: token };
}

function checkToken(token) {
  if (!token) return false;
  const raw = TOKEN_STORE.get('tok_' + token);
  if (!raw) return false;
  const rec = JSON.parse(raw);
  return rec.exp > Date.now();
}

/**
 * NOTE on CacheService: script cache entries can be evicted early under
 * memory pressure and max out around 6 hours regardless of the TTL you
 * request, which is fine for a single-farm tool but means very rarely a
 * session may need re-login sooner than SESSION_HOURS. For a stricter
 * guarantee, store tokens in a hidden Sheet or PropertiesService keyed
 * by token instead, and prune expired ones on login.
 *
 * NOTE on multiple workers: if different people should have different
 * accounts (not just one shared "admin"), store an array of
 * {username, hash} pairs as a JSON Script Property instead of single
 * ADMIN_USERNAME/ADMIN_PASSWORD_HASH values, and loop through it in
 * doLogin(). Never put per-user secrets in the HTML file — that's the
 * exact problem this template fixes.
 */

// ---- Plug in your existing implementations below ----
// function readAllSheets() { ... }
// function saveAllSheets(data) { ... }
// function upsertRecord(store, record) { ... }
// function deleteRecord(store, id) { ... }
