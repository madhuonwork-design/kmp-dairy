/**
 * KMP Dairy FarmOS — Google Sheets backend
 *
 * This Apps Script is the backend for the GitHub Pages frontend.
 * It stores each FarmOS module in its own Google Sheet tab.
 *
 * Google Sheet:
 * https://docs.google.com/spreadsheets/d/1NP2G-jueHSmngYha0UUyojhmKcIAf8_K0xpb87tLvNM/edit
 */

const SPREADSHEET_ID = '1NP2G-jueHSmngYha0UUyojhmKcIAf8_K0xpb87tLvNM';

const STORE_SHEETS = {
  cows: 'Cows',
  milk: 'Milk',
  health: 'Health',
  breeding: 'Breeding',
  finance: 'Finance',
  inventory: 'Inventory',
  settings: 'Settings'
};

const HEADER = ['ID', 'Data', 'UpdatedAt'];

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    let result;

    if (action === 'getAll') {
      result = { ok: true, data: readAll() };
    } else if (action === 'health') {
      result = { ok: true, service: 'KMP Dairy FarmOS', time: new Date().toISOString() };
    } else {
      result = { ok: false, error: 'Unknown GET action: ' + action };
    }

    // JSONP is used for GitHub Pages cross-origin reads.
    const callback = e && e.parameter ? e.parameter.callback : '';
    if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return json(result);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload
      ? e.parameter.payload
      : (e && e.postData ? e.postData.contents : '');

    if (!raw) return json({ ok: false, error: 'Missing payload' });

    const req = JSON.parse(raw);
    let result;

    if (req.action === 'upsert') {
      upsertRecord(req.store, req.record);
      result = { ok: true };
    } else if (req.action === 'delete') {
      deleteRecord(req.store, req.id);
      result = { ok: true };
    } else if (req.action === 'saveAll') {
      replaceAll(req.data || {});
      result = { ok: true };
    } else {
      result = { ok: false, error: 'Unknown POST action' };
    }

    return json(result);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet(store) {
  if (!STORE_SHEETS[store]) throw new Error('Invalid store: ' + store);

  const ss = getSpreadsheet();
  const name = STORE_SHEETS[store];
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sheet.setFrozenRows(1);
  } else {
    const current = sheet.getRange(1, 1, 1, HEADER.length).getValues()[0];
    const matches = HEADER.every((v, i) => String(current[i] || '') === v);
    if (!matches) {
      sheet.insertRows(1);
      sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}

function readAll() {
  const out = {
    cows: [],
    milk: [],
    health: [],
    breeding: [],
    finance: [],
    inventory: [],
    settings: {
      farm: 'KMP Dairy Farms',
      owner: '',
      location: '',
      currency: 'INR ₹'
    }
  };

  Object.keys(STORE_SHEETS).forEach(store => {
    const records = readStore(store);
    if (store === 'settings') {
      if (records.length) out.settings = Object.assign(out.settings, records[0]);
    } else {
      out[store] = records;
    }
  });

  return out;
}

function readStore(store) {
  const sheet = getOrCreateSheet(store);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getValues();
  const result = [];

  values.forEach(row => {
    const id = String(row[0] || '').trim();
    const raw = row[1];

    if (!id || raw === '' || raw === null) return;

    try {
      const obj = JSON.parse(String(raw));
      if (obj && typeof obj === 'object') result.push(obj);
    } catch (err) {
      // Ignore malformed rows instead of breaking the whole application.
    }
  });

  return result;
}

function upsertRecord(store, record) {
  if (!record || typeof record !== 'object') throw new Error('Invalid record');
  if (!record.id) record.id = Utilities.getUuid();
  record.updatedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = getOrCreateSheet(store);
    const id = String(record.id);
    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) {
          sheet.getRange(i + 2, 1, 1, 3).setValues([[id, JSON.stringify(record), record.updatedAt]]);
          return;
        }
      }
    }

    sheet.appendRow([id, JSON.stringify(record), record.updatedAt]);
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(store, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = getOrCreateSheet(store);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        return;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function replaceAll(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    Object.keys(STORE_SHEETS).forEach(store => {
      const sheet = getOrCreateSheet(store);
      const records = store === 'settings'
        ? [data.settings || {}]
        : (Array.isArray(data[store]) ? data[store] : []);

      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
      }

      if (!records.length) return;

      const now = new Date().toISOString();
      const rows = records.map((record, index) => {
        const obj = Object.assign({}, record);
        if (!obj.id) obj.id = store === 'settings' ? 'settings' : store + '_' + Utilities.getUuid();
        obj.updatedAt = obj.updatedAt || now;
        return [String(obj.id), JSON.stringify(obj), obj.updatedAt];
      });

      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Optional one-time setup helper.
 * Run this from Apps Script if you want all FarmOS tabs created before first use.
 */
function setupFarmSheets() {
  Object.keys(STORE_SHEETS).forEach(getOrCreateSheet);
  return 'KMP Dairy FarmOS sheets are ready.';
}
