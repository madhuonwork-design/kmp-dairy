# KMP Dairy FarmOS — GitHub Pages + Google Sheets

This version keeps your existing FarmOS interface and changes the storage layer from the old browser/Supabase storage to **Google Sheets through Google Apps Script**.

## Files

- `index.html` — upload this to GitHub Pages.
- `Code.gs` — paste this into Google Apps Script. It is the backend.
- `README.md` — this setup guide.

## 1. Prepare the Google Sheet

Your spreadsheet ID is already configured in `Code.gs`:

`1NP2G-jueHSmngYha0UUyojhmKcIAf8_K0xpb87tLvNM`

The backend automatically creates these tabs:

- Cows
- Milk
- Health
- Breeding
- Finance
- Inventory
- Settings

You do not need to manually create the columns.

## 2. Create the Apps Script backend

1. Open your Google Sheet.
2. Click **Extensions → Apps Script**.
3. Delete the default code in the editor.
4. Open `Code.gs` from this package and copy everything.
5. Paste it into Apps Script.
6. Click **Save**.
7. Run `setupFarmSheets()` once from the function dropdown.
8. Google will ask for permission. Review and allow it.
9. Return to Apps Script.

## 3. Deploy the backend

Google Apps Script web apps use `doGet` / `doPost` and are deployed from **Deploy → New deployment → Web app**.

Use:

- **Execute as:** Me
- **Who has access:** Anyone

Then click **Deploy** and copy the `/exec` web-app URL.

IMPORTANT: If the farm data is sensitive and you do not want an anonymous public API, do not use the `Anyone` setting. A GitHub Pages frontend and a publicly accessible Apps Script endpoint are not a strong security boundary.

## 4. Put the Apps Script URL into index.html

Open `index.html` and find:

`const API_URL = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';`

Replace it with your deployed Apps Script `/exec` URL.

Example:

`const API_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec';`

Do not add quotes around the URL beyond the existing single quotes.

## 5. Test before GitHub

1. Save `index.html`.
2. Open it in Chrome.
3. Add a cow.
4. Check the **Cows** tab in Google Sheets.
5. Add a milk record and check the **Milk** tab.
6. Open the app in another browser/device and press **Sync**.

The app also checks Google Sheets approximately every 15 seconds when the modal is closed.

## 6. Upload to GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html`.
3. Go to **Settings → Pages**.
4. Select the branch containing `index.html`.
5. Select `/root` if GitHub asks for a folder.
6. Save.
7. Open the GitHub Pages URL.

## 7. Important security note

The Google Sheet contains farm records such as finance, health, breeding and inventory information.

If the Apps Script deployment is set to **Anyone**, anyone who discovers the endpoint can potentially call the API. The spreadsheet itself can still remain non-public, because Apps Script executes as the deploying account, but the API endpoint should still be treated as public.

For a private production system, the next upgrade should be Google-account authentication/authorization instead of an anonymous endpoint.

## 8. What changed from the original file

The original HTML used a browser `window.storage` layer and also contained a Supabase client configuration.

This version removes that storage dependency and uses:

GitHub Pages → Apps Script Web App → Google Sheet

The existing FarmOS screens, forms, reports, backup and dashboard logic are retained.

