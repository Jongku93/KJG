/**
 * Setup.gs — 시트 자동 생성, 메뉴, 시트 직접 수정 감지
 */

/** 스프레드시트 메뉴 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('기후 엑스포')
    .addItem('시트 준비하기(처음 한 번)', 'setupSheets')
    .addItem('웹앱 주소 확인', 'showWebAppUrl')
    .addToUi();
}

/** 교사가 시트를 직접 고치면 캐시를 비워 앱에 바로 반영 */
function onEdit(e) {
  try {
    var name = e.range.getSheet().getName();
    if (SCHEMA[name]) bump_(name);
  } catch (err) { /* 무시 */ }
}

/** 편집기에서 직접 실행하거나 메뉴에서 실행 */
function setupSheets() {
  ensureSchema_();
  try {
    SpreadsheetApp.getUi().alert('시트 준비 완료! 이제 [배포 → 새 배포 → 웹 앱]으로 배포하세요. 자세한 방법은 README를 보세요.');
  } catch (e) { /* 편집기에서 실행한 경우 */ }
}

function showWebAppUrl() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
  SpreadsheetApp.getUi().alert(url
    ? '웹앱 주소(API_URL):\n' + url + '\n\n이 주소를 GitHub의 climate-expo/assets/config.js 에 붙여넣으세요.'
    : '아직 배포하지 않았어요. [배포 → 새 배포 → 웹 앱]으로 먼저 배포하세요.');
}

/** 요청마다 호출: 스키마 버전이 같으면 바로 통과 */
function ensureSchemaIfNeeded_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === SCHEMA_VERSION) return;
  withLock_(function () {
    if (props.getProperty('SCHEMA_VERSION') === SCHEMA_VERSION) return;
    ensureSchema_();
  });
}

/** 없는 시트·열을 만들고, 처음 만든 시트에는 초기 데이터를 넣는다 */
function ensureSchema_() {
  var ss = ss_();
  SHEET_ORDER.forEach(function (name) {
    var def = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    var created = false;
    if (!sh) { sh = ss.insertSheet(name); created = true; }

    var hm = headerMap_(sh);
    var missing = def.fields.filter(function (f) { return !hm[f[1]]; });
    if (missing.length) {
      var start = created ? 1 : sh.getLastColumn() + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing.map(function (f) { return f[1]; })]);
    }
    if (created) styleSheet_(sh, def);
    seedSheet_(name, sh, created);
  });

  // 새 스프레드시트의 빈 기본 시트 정리
  ['Sheet1', '시트1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', SCHEMA_VERSION);
  bump_(SHEET_ORDER);
}

function styleSheet_(sh, def) {
  var n = def.fields.length;
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1f2a44').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  def.fields.forEach(function (f, i) { if (f[2]) sh.setColumnWidth(i + 1, f[2]); });
  if (def.notes) {
    var hm = headerMap_(sh);
    def.fields.forEach(function (f) {
      if (def.notes[f[0]] && hm[f[1]]) sh.getRange(1, hm[f[1]]).setNote(def.notes[f[0]]);
    });
  }
}

function seedSheet_(name, sh, created) {
  if (name === 'Settings') {
    // 빠진 설정 키만 추가(업데이트 때도 기존 값은 그대로)
    var have = {};
    readTableFresh_('Settings').forEach(function (r) { have[r.key] = true; });
    var add = defaultSettings_().filter(function (r) { return !have[r[0]]; })
      .map(function (r) { return { key: r[0], value: r[1], note: r[2] }; });
    appendObjs_('Settings', add);
    return;
  }
  if (!created && sh.getLastRow() > 1) return;
  if (name === 'Climates') {
    appendObjs_('Climates', defaultClimates_().map(function (r) {
      return { name: r[0], desc: r[1], life: r[2], region: r[3], icon: r[4], color: r[5], active: r[6] };
    }));
    checkboxes_(name, 'active');
  } else if (name === 'Disasters') {
    appendObjs_('Disasters', defaultDisasters_().map(function (r) {
      return { id: r[0], climate: r[1], name: r[2], story: r[3], question: r[4], active: r[5] };
    }));
    checkboxes_(name, 'active');
  } else if (name === 'Teams' && created) {
    var codes = {};
    var rows = [];
    for (var i = 1; i <= 6; i++) rows.push({ id: 'T' + i, name: i + '팀', code: newTeamCode_(codes) });
    appendObjs_('Teams', rows);
  }
}

function checkboxes_(name, key) {
  var sh = sheet_(name);
  var col = colMap_(name, sh)[key];
  var last = sh.getLastRow();
  if (col && last > 1) {
    try { sh.getRange(2, col, last - 1, 1).insertCheckboxes(); } catch (e) { /* 선택 기능 */ }
  }
}

/** 헷갈리는 글자(0,O,1,I,L) 뺀 4자리 팀 코드 */
function newTeamCode_(used) {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (var t = 0; t < 500; t++) {
    var c = '';
    for (var i = 0; i < 4; i++) c += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!used[c]) { used[c] = true; return c; }
  }
  throw new Error('팀 코드를 만들지 못했어요.');
}
