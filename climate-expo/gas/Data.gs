/**
 * Data.gs — 시트 읽기/쓰기, 캐시, 잠금(LockService)
 *
 * 읽기: 시트별로 CacheService에 잠깐(30초) 저장해 24명이 동시에 새로고침해도 시트를 덜 읽는다.
 * 쓰기: 반드시 withLock_() 안에서 하고, 쓴 시트의 버전을 올려(bump_) 캐시를 무효화한다.
 */

var CACHE_TTL = 30;
var _ssMemo = null;

function ss_() {
  if (_ssMemo) return _ssMemo;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('스프레드시트를 찾을 수 없어요. 스프레드시트의 [확장 프로그램 → Apps Script]에서 만들거나, 프로젝트 설정 → 스크립트 속성에 SPREADSHEET_ID(스프레드시트 주소의 /d/와 /edit 사이 글자)를 추가하세요.');
    ss = SpreadsheetApp.openById(id);
  }
  _ssMemo = ss;
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    ensureSchema_(true);
    sh = ss_().getSheetByName(name);
  }
  return sh;
}

/** 시트 값 → JSON으로 보낼 수 있는 값 */
function cellOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  if (v === null || v === undefined) return '';
  return v;
}

/** 저장할 값 → 시트 값. 글은 앞에 '를 붙여 수식·날짜로 바뀌지 않게 한다. */
function cellIn_(v) {
  if (typeof v === 'string') return v === '' ? '' : "'" + v;
  if (v === null || v === undefined) return '';
  return v;
}

function headerMap_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  hdr.forEach(function (h, i) { map[String(h).trim()] = i + 1; });
  return map;
}

/** key → 열 번호(1부터). 없는 열은 0 */
function colMap_(name, sh) {
  var hm = headerMap_(sh || sheet_(name));
  var out = {};
  SCHEMA[name].fields.forEach(function (f) { out[f[0]] = hm[f[1]] || 0; });
  return out;
}

function readTableFresh_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (!values.length) return [];
  var hm = {};
  values[0].forEach(function (h, i) { hm[String(h).trim()] = i; });
  var fields = SCHEMA[name].fields;
  var idx = fields.map(function (f) { return hm.hasOwnProperty(f[1]) ? hm[f[1]] : -1; });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    for (var c = 0; c < row.length; c++) { if (row[c] !== '' && row[c] !== null) { empty = false; break; } }
    if (empty) continue;
    var o = { _row: r + 1 };
    for (var i = 0; i < fields.length; i++) o[fields[i][0]] = idx[i] >= 0 ? cellOut_(row[idx[i]]) : '';
    out.push(o);
  }
  return out;
}

/** 여러 시트를 캐시에서 한 번에 읽는다. { Teams: [...], Students: [...] } */
function readTables_(names) {
  var cache = CacheService.getScriptCache();
  var verKeys = names.map(function (n) { return 'ver:' + n; });
  var vers = cache.getAll(verKeys) || {};
  var dataKeys = names.map(function (n) { return 'tbl:' + n + ':' + (vers['ver:' + n] || '0'); });
  var hits = cache.getAll(dataKeys) || {};
  var out = {};
  var toPut = {};
  names.forEach(function (n, i) {
    var hit = hits[dataKeys[i]];
    if (hit) {
      try { out[n] = JSON.parse(hit); return; } catch (e) { /* 다시 읽기 */ }
    }
    out[n] = readTableFresh_(n);
    toPut[dataKeys[i]] = JSON.stringify(out[n]);
  });
  Object.keys(toPut).forEach(function (k) {
    try { cache.put(k, toPut[k], CACHE_TTL); } catch (e) { /* 100KB 넘으면 캐시 없이 사용 */ }
  });
  return out;
}

function readTable_(name) { return readTables_([name])[name]; }

/** 시트 내용이 바뀌었음을 알림 → 다음 읽기는 새로 읽음 */
function bump_(names) {
  var cache = CacheService.getScriptCache();
  var obj = {};
  [].concat(names).forEach(function (n) { obj['ver:' + n] = String(Date.now()) + Math.floor(Math.random() * 1000); });
  cache.putAll(obj, 21600);
}

/** 한 행의 여러 칸 쓰기 */
function setCells_(name, rowNum, obj) {
  var sh = sheet_(name);
  var cm = colMap_(name, sh);
  Object.keys(obj).forEach(function (k) {
    if (!cm[k]) return;
    sh.getRange(rowNum, cm[k]).setValue(cellIn_(obj[k]));
  });
}

function getCell_(name, rowNum, key) {
  var sh = sheet_(name);
  var cm = colMap_(name, sh);
  if (!cm[key]) return '';
  return cellOut_(sh.getRange(rowNum, cm[key]).getValue());
}

function objToRow_(name, obj, sh) {
  var hm = headerMap_(sh);
  var width = sh.getLastColumn();
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  SCHEMA[name].fields.forEach(function (f) {
    var c = hm[f[1]];
    if (c && obj.hasOwnProperty(f[0])) row[c - 1] = cellIn_(obj[f[0]]);
  });
  return row;
}

function appendObj_(name, obj) {
  var sh = sheet_(name);
  sh.appendRow(objToRow_(name, obj, sh));
  return sh.getLastRow();
}

/** 여러 행을 한 번에 추가 */
function appendObjs_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var rows = objs.map(function (o) { return objToRow_(name, o, sh); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/** 헤더만 남기고 내용 지우기 */
function clearBody_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).clearContent();
}

/** 팀ID로 행 찾기(없으면 만들기). 행 번호 반환 */
function ensureTeamRow_(name, teamId, extra) {
  var sh = sheet_(name);
  var cm = colMap_(name, sh);
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, cm.team, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(teamId)) return i + 2;
  }
  var obj = { team: teamId };
  if (extra) Object.keys(extra).forEach(function (k) { obj[k] = extra[k]; });
  return appendObj_(name, obj);
}

/** 동시에 쓰는 기능은 모두 이 안에서 실행 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('지금 친구들이 한꺼번에 저장하고 있어요. 잠시 후 다시 눌러 주세요.');
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Settings ---------- */

function getSettings_(tables) {
  var rows = tables && tables.Settings ? tables.Settings : readTable_('Settings');
  var s = {};
  rows.forEach(function (r) { if (r.key) s[String(r.key).trim()] = r.value; });
  return s;
}

function setSetting_(key, value) {
  var rows = readTableFresh_('Settings');
  var row = rows.filter(function (r) { return r.key === key; })[0];
  if (row) setCells_('Settings', row._row, { value: value });
  else appendObj_('Settings', { key: key, value: value, note: '' });
  bump_('Settings');
}

function truthy_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  return /^(true|y|yes|o|1|on|사용|열림|예)$/i.test(String(v).trim());
}

function num_(v, def) {
  var n = Number(v);
  return isNaN(n) || v === '' ? def : n;
}

function now_() { return new Date(); }

function clip_(v, max) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n');
  return s.length > max ? s.slice(0, max) : s;
}
