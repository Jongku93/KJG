/*
 * mock-gas.js — 로컬 시험용 Apps Script 흉내 (SpreadsheetApp, CacheService 등)
 * 실제 배포에는 쓰이지 않는다. node dev/server.js 로 화면까지 시험할 수 있다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function parseInput(v) {
  if (typeof v !== 'string') return v === undefined || v === null ? '' : v;
  if (v.startsWith("'")) return v.slice(1);
  if (v === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^(TRUE|FALSE)$/i.test(v)) return v.toUpperCase() === 'TRUE';
  if (/^\d{1,2}\/\d{1,2}$/.test(v)) return new Date(2026, Number(v.split('/')[0]) - 1, Number(v.split('/')[1]));
  return v;
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sheet.get(this.r, this.c); }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('setValues 크기 불일치');
    vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, parseInput(v))));
    return this;
  }
  setValue(v) { this.sheet.set(this.r, this.c, parseInput(v)); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, ''); return this; }
}
['setFontWeight', 'setBackground', 'setFontColor', 'setNote', 'insertCheckboxes', 'setNumberFormat'].forEach((m) => {
  Range.prototype[m] = function () { return this; };
});

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some((v) => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach((row) => { for (let j = row.length; j > 0; j--) if (row[j - 1] !== '' && row[j - 1] !== undefined) { m = Math.max(m, j); break; } }); return m; }
  getRange(r, c, nr, nc) {
    if (r < 1 || c < 1 || (nr !== undefined && nr < 1) || (nc !== undefined && nc < 1)) throw new Error('잘못된 범위 ' + [r, c, nr, nc]);
    return new Range(this, r, c, nr, nc);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, j) => this.set(r, j + 1, parseInput(v))); return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {} setColumnWidth() {}
}

class Spreadsheet {
  constructor() { this.sheets = []; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error('이미 있는 시트: ' + n); const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/MOCK/edit'; }
}

function createGas(opts) {
  opts = opts || {};
  const ss = new Spreadsheet();
  ss.insertSheet('시트1');
  const cacheStore = new Map();
  const props = new Map();
  const cache = {
    get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
    getAll: (ks) => { const o = {}; ks.forEach((k) => { if (cacheStore.has(k)) o[k] = cacheStore.get(k); }); return o; },
    put: (k, v) => { if (String(v).length > 100000) throw new Error('Argument too large'); cacheStore.set(k, String(v)); },
    putAll: (o) => Object.keys(o).forEach((k) => cacheStore.set(k, String(o[k]))),
    remove: (k) => cacheStore.delete(k)
  };
  const pad = (n) => String(n).padStart(2, '0');
  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      flush: () => {},
      getUi: () => { throw new Error('UI 없음'); }
    },
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      formatDate: (d, tz, fmt) => fmt.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
        .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())),
      getUuid: () => require('crypto').randomUUID(),
      sleep: () => {}
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'http://localhost/mock' }) },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' }
  };
  vm.createContext(context);
  const dir = path.join(__dirname, '..', 'gas');
  const files = opts.files || fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().map((f) => path.join(dir, f));
  files.forEach((f) => {
    vm.runInContext(fs.readFileSync(f, 'utf8'), context, { filename: path.basename(f) });
  });
  context._ss = ss;
  context._cache = cacheStore;
  return context;
}

module.exports = { createGas };
