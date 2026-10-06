/**
 * 2050 기후 도시 엑스포 — Apps Script 서버 코드 (한 파일 합본)
 * 이 파일 하나를 Apps Script의 Code.gs에 통째로 붙여넣으면 됩니다.
 * 원본: climate-expo/gas/*.gs  ·  만든 방법: node dev/bundle.js
 */
// ===== Config.gs =====
/**
 * Config.gs — 시트 구조(스키마), 직책·설계 항목, 초기 데이터
 *
 * 시트 헤더는 한국어 라벨로 찾는다. 교사가 열 순서를 바꿔도 동작하고,
 * 빠진 열은 ensureSchema_()가 맨 오른쪽에 다시 만든다.
 * 그로스포인트 앱과 나중에 연결할 때는 각 필드의 영어 key를 기준으로 맞춘다.
 */

var SCHEMA_VERSION = '2026-10-v1';

var ROLES = [
  { id: 'housing',   name: '주거·건축', icon: '🏠', hint: '집, 건물, 마을 모양' },
  { id: 'energy',    name: '에너지·물', icon: '⚡', hint: '전기, 난방·냉방, 물 모으기·쓰기' },
  { id: 'food',      name: '식량',      icon: '🌾', hint: '농사, 먹을거리, 저장' },
  { id: 'transport', name: '교통·안전', icon: '🚇', hint: '길, 탈것, 재난 대비' }
];

/** 2단계 설계 기록 항목. role이 있으면 그 직책 담당이 쓰고, 없으면 팀 공통. */
var DESIGN_FIELDS = [
  { key: 'city_name',        label: '도시 이름',                     group: 'basic',     max: 30 },
  { key: 'intro',            label: '한 줄 소개',                    group: 'basic',     max: 80 },
  { key: 'housing_what',     label: '주거·건축 - 무엇을 만들었나',    role: 'housing',    kind: 'what' },
  { key: 'housing_why',      label: '주거·건축 - 이 기후라서 이렇게 한 이유', role: 'housing', kind: 'why' },
  { key: 'energy_what',      label: '에너지·물 - 무엇을 만들었나',    role: 'energy',     kind: 'what' },
  { key: 'energy_why',       label: '에너지·물 - 이 기후라서 이렇게 한 이유', role: 'energy', kind: 'why' },
  { key: 'food_what',        label: '식량 - 무엇을 만들었나',         role: 'food',       kind: 'what' },
  { key: 'food_why',         label: '식량 - 이 기후라서 이렇게 한 이유', role: 'food',     kind: 'why' },
  { key: 'transport_what',   label: '교통·안전 - 무엇을 만들었나',    role: 'transport',  kind: 'what' },
  { key: 'transport_why',    label: '교통·안전 - 이 기후라서 이렇게 한 이유', role: 'transport', kind: 'why' },
  { key: 'tradition_keep',   label: '전통 생활에서 계승한 것',        group: 'tradition' },
  { key: 'tradition_future', label: '미래식으로 바꾼 방법',           group: 'tradition' },
  { key: 'ai_question',      label: 'AI에게 한 질문',                 group: 'ai' },
  { key: 'ai_fix',           label: '우리가 고친 것',                 group: 'ai' }
];

var RESPONSE_FIELDS = [
  { key: 'survive', label: '우리 도시는 어떻게 버티나' },
  { key: 'fix',     label: '설계에서 고친 점' }
];

var TEXT_MAX = 600;
var WILD = '공통';
var OVERRIDE_OPEN = '열림';
var OVERRIDE_LOCK = '잠김';

/** 각 시트: fields = [key, 헤더 라벨, 열 너비(px)] */
var SCHEMA = {
  Settings: {
    fields: [['key', '설정 키', 170], ['value', '값', 260], ['note', '설명', 420]]
  },
  Teams: {
    fields: [
      ['id', '팀ID', 70], ['name', '팀 이름', 80], ['code', '팀 코드', 90],
      ['climate', '기후', 70], ['disaster', '재난ID', 80], ['poster', '포스터 링크', 280],
      ['s1', '1단계', 70], ['s2', '2단계', 70], ['s3', '3단계', 70], ['s4', '4단계', 70],
      ['updated', '수정일', 140]
    ],
    notes: {
      s1: '빈칸 = 반 전체 설정을 따름 / 열림 = 이 팀만 열기 / 잠김 = 이 팀만 잠그기'
    }
  },
  Students: {
    fields: [['no', '번호', 60], ['name', '이름', 90], ['team', '팀ID', 70], ['role', '직책', 100], ['lastSeen', '최근 접속', 140]]
  },
  Climates: {
    fields: [
      ['name', '기후', 70], ['desc', '특징', 300], ['life', '전통 생활 힌트', 380],
      ['region', '대표 지역', 220], ['icon', '아이콘', 60], ['color', '색상', 80], ['active', '사용', 60]
    ]
  },
  Disasters: {
    fields: [
      ['id', '재난ID', 70], ['climate', '기후', 70], ['name', '재난 이름', 220],
      ['story', '상황', 380], ['question', '생각해 볼 질문', 320], ['active', '사용', 60]
    ],
    notes: { climate: '기후 이름(열대 등) 또는 "공통"(와일드카드)' }
  },
  Designs: {
    fields: [['team', '팀ID', 70]]
      .concat(DESIGN_FIELDS.map(function (f) { return [f.key, f.label, f.kind === 'why' ? 260 : 220]; }))
      .concat([['updated', '수정일', 140], ['by', '마지막 작성자', 100]])
  },
  DisasterResponses: {
    fields: [
      ['team', '팀ID', 70], ['disaster', '재난ID', 70], ['disasterName', '재난 이름', 200],
      ['survive', '우리 도시는 어떻게 버티나', 320], ['fix', '설계에서 고친 점', 320],
      ['updated', '수정일', 140], ['by', '마지막 작성자', 100]
    ]
  },
  Votes: {
    fields: [
      ['time', '제출 시각', 140], ['voterNo', '투표자 번호', 90], ['voterName', '투표자 이름', 90],
      ['voterTeam', '투표자 팀ID', 90], ['target', '투자한 팀ID', 90], ['coins', '코인', 60], ['reason', '투자 이유', 320]
    ]
  },
  Export_Points: {
    fields: [
      ['pid', '지급ID', 210], ['no', '번호', 60], ['name', '이름', 90], ['team', '팀ID', 70],
      ['code', '항목코드', 100], ['item', '항목', 160], ['points', '포인트', 70],
      ['calcAt', '계산일', 140], ['sync', '연동상태', 90]
    ],
    notes: { sync: '그로스포인트 연동용. 비어 있으면 아직 반영 전.' }
  },
  World_Buildings: {
    fields: [
      ['team', '팀ID', 70], ['city', '도시 이름', 140], ['climate', '기후', 70], ['intro', '한 줄 소개', 300],
      ['poster', '포스터 링크', 280], ['votes', '득표', 60], ['regAt', '등록일', 140]
    ]
  }
};

var SHEET_ORDER = ['Settings', 'Teams', 'Students', 'Climates', 'Disasters', 'Designs',
  'DisasterResponses', 'Votes', 'Export_Points', 'World_Buildings'];

/** Settings 초기값: [키, 값, 설명] */
function defaultSettings_() {
  var year = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy');
  return [
    ['ADMIN_PIN', '1234', '교사 화면 PIN. 처음 쓰기 전에 꼭 바꾸세요(6자리 이상 권장).'],
    ['CLASS_NAME', '6학년 ○반', '화면 위쪽에 보이는 학급 이름'],
    ['PROJECT_ID', 'EXPO-' + year, '포인트 지급ID 앞부분. 학기마다 바꾸면 그로스포인트에서 중복 지급을 막을 수 있음'],
    ['STAGE1_OPEN', true, '1단계(뽑는다) 반 전체 열림'],
    ['STAGE2_OPEN', false, '2단계(짓는다) 반 전체 열림'],
    ['STAGE3_OPEN', false, '3단계(버틴다) 반 전체 열림 = 재난 경보'],
    ['STAGE4_OPEN', false, '4단계(자랑한다) 반 전체 열림 = 포스터 제출·엑스포 관람'],
    ['VOTING_OPEN', false, '투자 투표 열림'],
    ['RESULTS_PUBLIC', false, '결과 발표(학생 화면에 순위 공개)'],
    ['COINS_PER_STUDENT', 10, '학생 1명이 투자하는 코인 수'],
    ['POINT_STAGE1', 5, '포인트: 1단계 완료(기후 뽑기 + 직책 선택)'],
    ['POINT_STAGE2', 10, '포인트: 2단계 완료(내 직책 칸 + 팀 공통 칸 작성)'],
    ['POINT_DISASTER', 10, '포인트: 3단계 재난 대응 작성'],
    ['POINT_STAGE4', 10, '포인트: 4단계 포스터 링크 제출'],
    ['POINT_VOTE', 3, '포인트: 투자 투표 참여(개인)'],
    ['POINT_WIN_1', 20, '포인트: 우승(1위) 팀원'],
    ['POINT_WIN_2', 10, '포인트: 2위 팀원'],
    ['POINT_WIN_3', 5, '포인트: 3위 팀원'],
    ['AI_RULES', [
      '먼저 우리 팀끼리 생각한 다음에 AI에게 묻는다.',
      'AI 답을 그대로 옮기지 않는다. "이 기후라서?"를 우리 말로 다시 쓴다.',
      'AI가 알려 준 사실은 교과서나 다른 자료로 한 번 더 확인한다.',
      '이름·학교·사진 같은 개인정보는 AI에게 입력하지 않는다.',
      'AI에게 한 질문 1개와 우리가 고친 것 1개를 꼭 기록한다.'
    ].join('\n'), 'AI 사용 규칙(한 줄에 하나씩). 미션 소개 화면에 보임']
  ];
}

/** 기후 카드 초기 데이터: 특징은 교사 제공 문구, 생활 힌트는 교과서 수준 예시(수정 가능) */
function defaultClimates_() {
  return [
    ['열대', '일 년 내내 기온이 높고 강수량이 많음',
      '땅에서 바닥을 띄운 고상 가옥, 비가 잘 흘러내리는 급한 지붕, 얇고 바람이 잘 통하는 옷',
      '동남아시아, 아마존강 유역, 아프리카 중부', '🌴', '#22a06b', true],
    ['건조', '일 년 강수량이 500mm가 안 될 정도로 비가 적음',
      '흙벽돌로 지은 두꺼운 벽과 작은 창, 햇볕과 모래바람을 막는 헐렁한 긴 옷, 오아시스 농업, 초원의 이동식 집(게르)',
      '사하라 사막, 아라비아반도, 몽골 초원', '🏜️', '#e0a030', true],
    ['온대', '사계절이 뚜렷함',
      '계절마다 바뀌는 옷차림, 여름 비를 이용한 벼농사, 지중해 연안의 하얀 벽 집과 올리브·포도 재배',
      '우리나라, 서부 유럽, 지중해 연안', '🍃', '#2f9be0', true],
    ['냉대', '사계절이 있지만 겨울이 더 춥고 김',
      '넓은 침엽수림(타이가)의 나무로 지은 통나무집, 추위를 막는 두꺼운 벽과 털옷, 목재 산업',
      '러시아 시베리아, 캐나다', '🌲', '#5b6cf0', true],
    ['한대', '일 년 내내 매우 추움, 가장 따뜻한 달도 10℃ 미만',
      '동물 가죽·털로 만든 옷, 순록 유목, 사냥과 고기잡이, 사냥할 때 잠깐 머무는 얼음집(이글루)',
      '북극해 연안, 그린란드, 남극', '❄️', '#3cc0d8', true],
    ['고산', '적도 부근 높은 곳, 일 년 내내 봄처럼 온화함',
      '서늘한 기후를 이용한 감자·옥수수 재배, 산비탈의 계단식 밭, 라마·알파카 기르기, 낮과 밤 기온 차에 맞춘 겹쳐 입는 옷',
      '남아메리카 안데스 산지(에콰도르 키토 등)', '🏔️', '#9b6be0', true]
  ];
}

function defaultDisasters_() {
  return [
    ['D01', '열대', '집중 폭우와 홍수', '며칠 동안 엄청난 비가 한꺼번에 쏟아져 강물이 넘쳤어요. 도시의 낮은 곳부터 물에 잠기고 있어요.', '물에 잠기지 않으려면 집과 길을 어떻게 바꿔야 할까?', true],
    ['D02', '열대', '무더위와 높은 습도', '덥고 끈적끈적한 날이 계속되고 있어요. 사람들이 쉽게 지치고 음식도 빨리 상해요.', '에어컨에만 기대지 않고 시원하게 지내려면?', true],
    ['D03', '건조', '심한 물 부족', '몇 달째 비가 오지 않아 저수지와 지하수가 줄어들고 있어요.', '물을 모으고, 아끼고, 다시 쓰는 방법은?', true],
    ['D04', '건조', '모래폭풍', '거센 바람이 모래를 몰고 와 하늘이 누렇게 변했어요. 창문 틈과 도로, 발전 시설에 모래가 쌓여요.', '모래바람이 들어오지 않게 하려면 무엇을 바꿔야 할까?', true],
    ['D05', '온대', '여름 폭염', '한여름 낮 기온이 아주 높은 날이 이어지고 있어요. 노인과 어린이가 특히 위험해요.', '더위에 약한 사람들을 어떻게 지킬까?', true],
    ['D06', '온대', '태풍', '강한 바람과 많은 비를 몰고 온 태풍이 도시를 지나가요. 나무가 쓰러지고 전기가 끊겼어요.', '바람과 비에 강한 도시를 만들려면?', true],
    ['D07', '냉대', '긴 한파와 폭설', '영하의 추위가 몇 주째 이어지고 눈이 지붕 높이까지 쌓였어요.', '눈에 갇히지 않고 따뜻하게 지내려면?', true],
    ['D08', '냉대', '난방 에너지 부족', '겨울이 길어지면서 난방에 쓸 에너지가 바닥나고 있어요.', '에너지를 덜 쓰면서도 따뜻한 방법은?', true],
    ['D09', '한대', '얼어 있던 땅이 녹아 건물 기울어짐', '일 년 내내 얼어 있던 땅이 녹기 시작해 물렁해졌어요. 건물이 기울고 도로가 갈라져요.', '땅이 녹아도 버티는 건물은 어떻게 지을까?', true],
    ['D10', '한대', '몇 달간 이어지는 어둠', '해가 거의 뜨지 않는 날이 몇 달 동안 이어져요. 사람들이 우울해하고 햇빛 발전도 멈췄어요.', '햇빛 없이도 건강하게 지내고 전기를 얻으려면?', true],
    ['D11', '고산', '산사태', '큰비가 내린 뒤 가파른 산비탈의 흙과 돌이 무너져 내렸어요.', '산비탈에 사는 사람들을 어떻게 지킬까?', true],
    ['D12', '고산', '가파른 지형 때문에 끊긴 교통', '하나뿐인 산길이 무너져 도시가 고립되었어요. 식량과 물건이 들어오지 않아요.', '길이 끊겨도 물건과 사람이 오가려면?', true],
    ['D13', WILD, '2050년 최고기온 기록 경신', '우리 도시가 역사상 가장 더운 날을 기록했어요. 기후에 맞춰 지은 설계가 더 뜨거운 날씨도 버틸 수 있을까요?', '우리 기후에 맞춘 설계 중 무엇을 보강해야 할까?', true],
    ['D14', WILD, '이웃 도시 난민 1만 명 도착', '기후 재난을 겪은 이웃 도시에서 1만 명이 우리 도시로 피난을 왔어요. 집, 물, 식량, 교통이 모자라요.', '갑자기 늘어난 사람들과 함께 살려면 무엇이 필요할까?', true]
  ];
}

// ===== Data.gs =====
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
    if (!id) throw new Error('스프레드시트를 찾을 수 없어요. 스프레드시트의 [확장 프로그램 → Apps Script]에서 만든 스크립트인지 확인하세요.');
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

// ===== Setup.gs =====
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

// ===== Logic.gs =====
/**
 * Logic.gs — 단계 열림/완료 판정, 진행 현황, 투표 집계, 포인트 계산
 */

var ALL_TABLES = ['Settings', 'Teams', 'Students', 'Climates', 'Disasters', 'Designs', 'DisasterResponses', 'Votes'];

function loadCtx_() {
  var t = readTables_(ALL_TABLES);
  return {
    settings: getSettings_(t),
    teams: t.Teams.filter(function (r) { return r.id; }),
    students: t.Students.filter(function (r) { return r.no !== '' && r.name; }),
    climates: t.Climates.filter(function (r) { return r.name; }),
    disasters: t.Disasters.filter(function (r) { return r.id; }),
    designs: t.Designs,
    responses: t.DisasterResponses,
    votes: t.Votes.filter(function (r) { return r.voterNo !== ''; })
  };
}

function roleById_(id) { return ROLES.filter(function (r) { return r.id === id; })[0] || null; }
function roleByName_(name) {
  var n = String(name || '').trim();
  return ROLES.filter(function (r) { return r.name === n || r.id === n; })[0] || null;
}

function stageOpen_(settings, team, n) {
  var ov = String(team['s' + n] || '').trim();
  if (ov === OVERRIDE_OPEN) return true;
  if (ov === OVERRIDE_LOCK) return false;
  return truthy_(settings['STAGE' + n + '_OPEN']);
}

function sortByNo_(a, b) { return Number(a.no) - Number(b.no) || String(a.no).localeCompare(String(b.no)); }

function membersOf_(ctx, teamId) {
  return ctx.students.filter(function (s) { return s.team === teamId; }).sort(sortByNo_).map(function (s) {
    var role = roleByName_(s.role);
    return { no: s.no, name: s.name, role: role ? role.id : '' };
  });
}

function rowFor_(rows, teamId) { return rows.filter(function (r) { return r.team === teamId; })[0] || {}; }

function designOf_(ctx, teamId) {
  var row = rowFor_(ctx.designs, teamId);
  var d = {};
  DESIGN_FIELDS.forEach(function (f) { d[f.key] = row[f.key] === undefined ? '' : String(row[f.key]); });
  return { values: d, updated: row.updated || '', by: row.by || '' };
}

function responseOf_(ctx, teamId) {
  var row = rowFor_(ctx.responses, teamId);
  return { survive: String(row.survive || ''), fix: String(row.fix || ''), updated: row.updated || '', by: row.by || '' };
}

function climateOf_(ctx, name) {
  var c = ctx.climates.filter(function (x) { return x.name === name; })[0];
  return c ? publicClimate_(c) : null;
}

function publicClimate_(c) {
  return { name: c.name, desc: c.desc, life: c.life, region: c.region, icon: c.icon || '🌐', color: c.color || '#4fd1c5' };
}

function disasterOf_(ctx, id) {
  var d = ctx.disasters.filter(function (x) { return x.id === id; })[0];
  return d ? { id: d.id, climate: d.climate, name: d.name, story: d.story, question: d.question, wild: d.climate === WILD } : null;
}

function filled_(v) { return String(v === undefined || v === null ? '' : v).trim() !== ''; }

/** 팀 하나의 단계별 열림·완료·빠진 칸 */
function teamStatus_(ctx, team) {
  var members = membersOf_(ctx, team.id);
  var design = designOf_(ctx, team.id).values;
  var resp = responseOf_(ctx, team.id);

  var miss1 = [];
  if (!team.climate) miss1.push('기후 카드 뽑기');
  members.forEach(function (m) { if (!m.role) miss1.push(m.name + ' 직책 선택'); });
  if (!members.length) miss1.push('팀원 없음');

  var miss2 = DESIGN_FIELDS.filter(function (f) { return !filled_(design[f.key]); }).map(function (f) { return f.label; });

  var miss3 = [];
  if (!team.disaster) miss3.push('재난 카드 뽑기');
  RESPONSE_FIELDS.forEach(function (f) { if (!filled_(resp[f.key])) miss3.push(f.label); });

  var miss4 = filled_(team.poster) ? [] : ['포스터 링크 제출'];

  var lists = [miss1, miss2, miss3, miss4];
  var stages = [1, 2, 3, 4].map(function (n) {
    return { n: n, open: stageOpen_(ctx.settings, team, n), done: lists[n - 1].length === 0, missing: lists[n - 1] };
  });
  return { members: members, design: design, response: resp, stages: stages };
}

/** 학생 개인의 2단계 완료: 내 직책 칸 2개 + 팀 공통 칸 모두 */
function studentStage2Done_(member, design) {
  return DESIGN_FIELDS.every(function (f) {
    if (f.role && member.role && f.role !== member.role) return true;
    if (f.role && !member.role) return filled_(design[f.key]);
    return filled_(design[f.key]);
  });
}

function votedSet_(ctx) {
  var s = {};
  ctx.votes.forEach(function (v) { s[String(v.voterNo)] = true; });
  return s;
}

/** 투표 집계와 순위 */
function computeResults_(ctx) {
  var coins = {}, investors = {}, reasons = {};
  ctx.votes.forEach(function (v) {
    var c = num_(v.coins, 0);
    coins[v.target] = (coins[v.target] || 0) + c;
    (investors[v.target] = investors[v.target] || {})[String(v.voterNo)] = true;
    if (filled_(v.reason)) {
      var list = reasons[v.target] = reasons[v.target] || [];
      var txt = String(v.reason).trim();
      if (list.indexOf(txt) < 0) list.push(txt);
    }
  });
  var list = ctx.teams.filter(function (t) { return t.climate; }).map(function (t) {
    var d = designOf_(ctx, t.id).values;
    var c = climateOf_(ctx, t.climate);
    return {
      id: t.id, name: t.name, climate: t.climate, icon: c ? c.icon : '🌐', color: c ? c.color : '#4fd1c5',
      city: d.city_name || t.name, intro: d.intro, poster: t.poster,
      coins: coins[t.id] || 0, investors: Object.keys(investors[t.id] || {}).length,
      reasons: (reasons[t.id] || []).slice(0, 12)
    };
  });
  var idNum = function (id) { return Number(String(id).replace(/\D/g, '')) || 0; };
  list.sort(function (a, b) { return b.coins - a.coins || idNum(a.id) - idNum(b.id); });
  list.forEach(function (r, i) {
    r.rank = (i > 0 && list[i - 1].coins === r.coins) ? list[i - 1].rank : i + 1;
  });
  return list;
}

/** 학생별 포인트 행 계산 (Export_Points 형식) */
function computePoints_(ctx) {
  var s = ctx.settings;
  var pid = String(s.PROJECT_ID || 'EXPO');
  var voted = votedSet_(ctx);
  var results = computeResults_(ctx);
  var hasVotes = ctx.votes.length > 0;
  var rankOf = {};
  results.forEach(function (r) { rankOf[r.id] = r; });
  var rows = [];

  ctx.teams.forEach(function (team) {
    var st = teamStatus_(ctx, team);
    st.members.forEach(function (m) {
      var add = function (code, item, key) {
        var p = num_(s[key], 0);
        if (p) rows.push({ pid: pid + '-' + m.no + '-' + code, no: m.no, name: m.name, team: team.id, code: code, item: item, points: p });
      };
      if (st.stages[0].done) add('STAGE1', '1단계 완료(뽑기·직책)', 'POINT_STAGE1');
      if (studentStage2Done_(m, st.design)) add('STAGE2', '2단계 완료(설계 기록)', 'POINT_STAGE2');
      if (st.stages[2].done) add('DISASTER', '재난 대응', 'POINT_DISASTER');
      if (st.stages[3].done) add('STAGE4', '4단계 완료(포스터 제출)', 'POINT_STAGE4');
      if (voted[String(m.no)]) add('VOTE', '투자 투표 참여', 'POINT_VOTE');
      var r = rankOf[team.id];
      if (hasVotes && r && r.coins > 0 && r.rank <= 3) add('WIN' + r.rank, '엑스포 ' + r.rank + '위', 'POINT_WIN_' + r.rank);
    });
  });
  return rows;
}

/** 교사 대시보드용 팀 요약 */
function buildDashboard_(ctx) {
  var voted = votedSet_(ctx);
  return ctx.teams.map(function (team) {
    var st = teamStatus_(ctx, team);
    var dis = disasterOf_(ctx, team.disaster);
    return {
      id: team.id, name: team.name, code: team.code, climate: team.climate,
      climateInfo: climateOf_(ctx, team.climate), poster: team.poster,
      overrides: { 1: team.s1 || '', 2: team.s2 || '', 3: team.s3 || '', 4: team.s4 || '' },
      disaster: dis, stages: st.stages,
      members: st.members.map(function (m) {
        return { no: m.no, name: m.name, role: m.role, voted: !!voted[String(m.no)], stage2: studentStage2Done_(m, st.design) };
      }),
      design: st.design, response: st.response
    };
  });
}

// ===== StudentApi.gs =====
/**
 * StudentApi.gs — 학생 화면에서 부르는 함수
 * 학생 인증 = 팀 코드 + 번호 (비밀번호 없음, 수업용)
 */

function findTeamByCode_(teams, code) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) throw new Error('팀 코드를 입력해 주세요.');
  var team = teams.filter(function (t) { return String(t.code).trim().toUpperCase() === c; })[0];
  if (!team) throw new Error('팀 코드를 다시 확인해 주세요.');
  return team;
}

function authFrom_(teams, students, code, no) {
  var team = findTeamByCode_(teams, code);
  var st = students.filter(function (s) { return String(s.no) === String(no) && s.team === team.id; })[0];
  if (!st) throw new Error('우리 팀 명단에서 이름을 찾을 수 없어요. 다시 로그인해 주세요.');
  return { team: team, student: st };
}

/** 잠금 안에서 쓰는 최신 인증 */
function authFresh_(code, no) {
  var teams = readTableFresh_('Teams');
  var students = readTableFresh_('Students');
  var a = authFrom_(teams, students, code, no);
  a.teams = teams;
  a.students = students;
  return a;
}

/* ---------- 로그인 ---------- */

function apiLookupTeam(code) {
  var ctx = loadCtx_();
  var team = findTeamByCode_(ctx.teams, code);
  var members = membersOf_(ctx, team.id);
  if (!members.length) throw new Error('이 팀에 아직 명단이 없어요. 선생님께 알려 주세요.');
  return { team: { id: team.id, name: team.name }, members: members };
}

function apiLogin(code, no) {
  var ctx = loadCtx_();
  var a = authFrom_(ctx.teams, ctx.students, code, no);
  try { setCells_('Students', a.student._row, { lastSeen: now_() }); } catch (e) { /* 접속 기록은 실패해도 무시 */ }
  return buildStudentState_(ctx, a.team, a.student);
}

function apiState(code, no) {
  var ctx = loadCtx_();
  var a = authFrom_(ctx.teams, ctx.students, code, no);
  return buildStudentState_(ctx, a.team, a.student);
}

function buildStudentState_(ctx, team, student) {
  var s = ctx.settings;
  var st = teamStatus_(ctx, team);
  var me = st.members.filter(function (m) { return String(m.no) === String(student.no); })[0];
  var d = designOf_(ctx, team.id);
  var takenBy = {};
  ctx.teams.forEach(function (t) { if (t.climate) takenBy[t.climate] = t; });

  var state = {
    serverTime: Utilities.formatDate(now_(), 'Asia/Seoul', 'HH:mm:ss'),
    settings: {
      className: s.CLASS_NAME || '',
      coins: num_(s.COINS_PER_STUDENT, 10),
      votingOpen: truthy_(s.VOTING_OPEN),
      resultsPublic: truthy_(s.RESULTS_PUBLIC),
      aiRules: String(s.AI_RULES || '').split('\n').map(function (x) { return x.trim(); }).filter(String)
    },
    roles: ROLES,
    designFields: DESIGN_FIELDS,
    responseFields: RESPONSE_FIELDS,
    me: { no: me.no, name: me.name, role: me.role },
    team: {
      id: team.id, name: team.name, climate: team.climate, poster: team.poster || '',
      members: st.members
    },
    climateInfo: climateOf_(ctx, team.climate),
    stages: st.stages,
    climates: ctx.climates.filter(function (c) { return truthy_(c.active) || takenBy[c.name]; }).map(function (c) {
      var o = publicClimate_(c);
      var t = takenBy[c.name];
      o.takenBy = t ? t.name : '';
      o.mine = !!t && t.id === team.id;
      return o;
    }),
    design: d.values,
    designMeta: { updated: d.updated, by: d.by },
    disaster: team.disaster ? disasterOf_(ctx, team.disaster) : null,
    response: st.response,
    vote: { open: truthy_(s.VOTING_OPEN), done: false, mine: [] },
    expo: null,
    results: null
  };

  var mine = ctx.votes.filter(function (v) { return String(v.voterNo) === String(student.no); });
  if (mine.length) {
    state.vote.done = true;
    state.vote.mine = mine.map(function (v) { return { target: v.target, coins: num_(v.coins, 0), reason: v.reason || '' }; });
  }

  if (st.stages[3].open) state.expo = buildExpo_(ctx, team.id);
  if (state.settings.resultsPublic) state.results = computeResults_(ctx);
  return state;
}

/** 엑스포 관람용 모든 팀 도시 카드 */
function buildExpo_(ctx, myTeamId) {
  return ctx.teams.filter(function (t) { return t.climate; }).map(function (t) {
    var st = teamStatus_(ctx, t);
    var c = climateOf_(ctx, t.climate);
    var dis = disasterOf_(ctx, t.disaster);
    return {
      id: t.id, name: t.name, mine: t.id === myTeamId,
      climate: t.climate, icon: c ? c.icon : '🌐', color: c ? c.color : '#4fd1c5',
      city: st.design.city_name, intro: st.design.intro,
      roles: ROLES.map(function (r) {
        var holder = st.members.filter(function (m) { return m.role === r.id; })[0];
        return { role: r.id, holder: holder ? holder.name : '', what: st.design[r.id + '_what'], why: st.design[r.id + '_why'] };
      }),
      tradition: { keep: st.design.tradition_keep, future: st.design.tradition_future },
      disaster: dis ? { name: dis.name, wild: dis.wild } : null,
      response: { survive: st.response.survive, fix: st.response.fix },
      poster: t.poster || ''
    };
  });
}

/* ---------- 1단계: 기후 뽑기, 직책 ---------- */

function apiDrawClimate(code, no) {
  withLock_(function () {
    var a = authFresh_(code, no);
    var settings = getSettings_();
    if (!stageOpen_(settings, a.team, 1)) throw new Error('1단계가 아직 잠겨 있어요.');
    if (a.team.climate) return;
    var taken = {};
    a.teams.forEach(function (t) { if (t.climate) taken[t.climate] = true; });
    var avail = readTableFresh_('Climates').filter(function (c) { return c.name && truthy_(c.active) && !taken[c.name]; });
    if (!avail.length) throw new Error('남은 기후 카드가 없어요. 선생님께 알려 주세요.');
    var pick = avail[Math.floor(Math.random() * avail.length)];
    setCells_('Teams', a.team._row, { climate: pick.name, updated: now_() });
    bump_('Teams');
  });
  return apiState(code, no);
}

function apiChooseRole(code, no, roleId) {
  withLock_(function () {
    var a = authFresh_(code, no);
    if (!stageOpen_(getSettings_(), a.team, 1)) throw new Error('1단계가 잠겨서 직책을 바꿀 수 없어요.');
    var name = '';
    if (roleId) {
      var role = roleById_(roleId);
      if (!role) throw new Error('없는 직책이에요.');
      var holder = a.students.filter(function (s) {
        var r = roleByName_(s.role);
        return s.team === a.team.id && r && r.id === role.id && String(s.no) !== String(no);
      })[0];
      if (holder) throw new Error(holder.name + ' 친구가 이미 ' + role.name + ' 직책을 맡았어요.');
      name = role.name;
    }
    setCells_('Students', a.student._row, { role: name });
    bump_('Students');
  });
  return apiState(code, no);
}

/* ---------- 2단계: 설계 기록 (자동 저장) ---------- */

function apiSaveDesign(code, no, key, value, prev) {
  var f = DESIGN_FIELDS.filter(function (x) { return x.key === key; })[0];
  if (!f) throw new Error('알 수 없는 칸이에요.');
  value = clip_(value, f.max || TEXT_MAX);
  return withLock_(function () {
    var a = authFresh_(code, no);
    if (!stageOpen_(getSettings_(), a.team, 2)) throw new Error('2단계가 잠겨 있어서 저장할 수 없어요.');
    if (f.role) {
      var holder = a.students.filter(function (s) {
        var r = roleByName_(s.role);
        return s.team === a.team.id && r && r.id === f.role;
      })[0];
      if (holder && String(holder.no) !== String(no)) {
        throw new Error('이 칸은 ' + holder.name + '(' + roleById_(f.role).name + ') 담당이에요.');
      }
    }
    var row = ensureTeamRow_('Designs', a.team.id);
    return saveTextCell_('Designs', row, key, value, prev, a.student.name);
  });
}

/** 같은 칸을 다른 친구가 먼저 고쳤으면 덮어쓰지 않고 알려 준다 */
function saveTextCell_(sheetName, row, key, value, prev, byName) {
  var cur = String(getCell_(sheetName, row, key));
  if (prev !== null && prev !== undefined && cur !== String(prev) && cur !== value) {
    return { conflict: true, current: cur, by: String(getCell_(sheetName, row, 'by')) };
  }
  var obj = { updated: now_(), by: byName };
  obj[key] = value;
  setCells_(sheetName, row, obj);
  bump_(sheetName);
  return { saved: true, value: value };
}

/* ---------- 3단계: 재난 ---------- */

/** 우리 기후 카드 + 공통 와일드카드 중 무작위. 다른 팀이 이미 받은 와일드카드는 되도록 피한다. */
function pickDisaster_(team, teams, disasters) {
  var pool = disasters.filter(function (d) {
    return d.id && truthy_(d.active) && (d.climate === team.climate || d.climate === WILD);
  });
  if (!pool.length) return null;
  var usedWild = {};
  teams.forEach(function (t) { if (t.id !== team.id && t.disaster) usedWild[t.disaster] = true; });
  var fresh = pool.filter(function (d) { return !(d.climate === WILD && usedWild[d.id]); });
  var from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

function assignDisaster_(team, d) {
  setCells_('Teams', team._row, { disaster: d ? d.id : '', updated: now_() });
  if (d) {
    var row = ensureTeamRow_('DisasterResponses', team.id);
    setCells_('DisasterResponses', row, { disaster: d.id, disasterName: d.name });
  }
}

function apiDrawDisaster(code, no) {
  withLock_(function () {
    var a = authFresh_(code, no);
    if (!stageOpen_(getSettings_(), a.team, 3)) throw new Error('아직 재난 경보가 울리지 않았어요.');
    if (a.team.disaster) return;
    if (!a.team.climate) throw new Error('먼저 1단계에서 기후 카드를 뽑아야 해요.');
    var d = pickDisaster_(a.team, a.teams, readTableFresh_('Disasters'));
    if (!d) throw new Error('뽑을 수 있는 재난 카드가 없어요. 선생님께 알려 주세요.');
    assignDisaster_(a.team, d);
    bump_(['Teams', 'DisasterResponses']);
  });
  return apiState(code, no);
}

function apiSaveResponse(code, no, key, value, prev) {
  var f = RESPONSE_FIELDS.filter(function (x) { return x.key === key; })[0];
  if (!f) throw new Error('알 수 없는 칸이에요.');
  value = clip_(value, TEXT_MAX);
  return withLock_(function () {
    var a = authFresh_(code, no);
    if (!stageOpen_(getSettings_(), a.team, 3)) throw new Error('3단계가 잠겨 있어서 저장할 수 없어요.');
    if (!a.team.disaster) throw new Error('먼저 재난 카드를 뽑아야 해요.');
    var row = ensureTeamRow_('DisasterResponses', a.team.id);
    return saveTextCell_('DisasterResponses', row, key, value, prev, a.student.name);
  });
}

/* ---------- 4단계: 포스터, 투표 ---------- */

function apiSubmitPoster(code, no, url) {
  url = String(url || '').trim();
  if (!/^https:\/\/\S+$/.test(url) || url.length > 500) throw new Error('https:// 로 시작하는 링크를 붙여넣어 주세요.');
  withLock_(function () {
    var a = authFresh_(code, no);
    if (!stageOpen_(getSettings_(), a.team, 4)) throw new Error('4단계가 아직 잠겨 있어요.');
    setCells_('Teams', a.team._row, { poster: url, updated: now_() });
    bump_('Teams');
  });
  return apiState(code, no);
}

function apiSubmitVote(code, no, alloc, reasons) {
  alloc = alloc || {};
  reasons = reasons || {};
  withLock_(function () {
    var settings = getSettings_();
    if (!truthy_(settings.VOTING_OPEN)) throw new Error('투자 투표가 아직 열리지 않았어요.');
    var a = authFresh_(code, no);
    var votes = readTableFresh_('Votes');
    if (votes.some(function (v) { return String(v.voterNo) === String(no); })) throw new Error('이미 투자를 마쳤어요. 투자는 한 번만 할 수 있어요.');
    var coins = num_(settings.COINS_PER_STUDENT, 10);
    var total = 0;
    var rows = [];
    var time = now_();
    Object.keys(alloc).forEach(function (tid) {
      var c = Number(alloc[tid]);
      if (!c) return;
      if (c < 0 || Math.floor(c) !== c) throw new Error('코인 수가 올바르지 않아요.');
      if (tid === a.team.id) throw new Error('우리 팀에는 투자할 수 없어요.');
      var target = a.teams.filter(function (t) { return t.id === tid && t.climate; })[0];
      if (!target) throw new Error('없는 팀에 투자하려고 했어요.');
      total += c;
      rows.push({
        time: time, voterNo: a.student.no, voterName: a.student.name, voterTeam: a.team.id,
        target: tid, coins: c, reason: clip_(reasons[tid] || '', 120)
      });
    });
    if (total !== coins) throw new Error('코인 ' + coins + '개를 모두 나눠 주세요. (지금 ' + total + '개)');
    appendObjs_('Votes', rows);
    bump_('Votes');
  });
  return apiState(code, no);
}

// ===== AdminApi.gs =====
/**
 * AdminApi.gs — 교사 관리자 화면에서 부르는 함수 (PIN 로그인 → 토큰)
 */

function apiAdminLogin(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('adminFail') || 0);
  if (fails >= 8) throw new Error('PIN을 여러 번 틀렸어요. 5분 뒤에 다시 시도하세요.');
  var real = String(getSettings_().ADMIN_PIN || '').trim();
  var given = String(pin || '').trim();
  var same = given === real || (/^\d+$/.test(given) && /^\d+$/.test(real) && Number(given) === Number(real));
  if (!real || !same) {
    cache.put('adminFail', String(fails + 1), 300);
    Utilities.sleep(800);
    throw new Error('PIN이 맞지 않아요.');
  }
  cache.remove('adminFail');
  var token = Utilities.getUuid();
  cache.put('adm:' + token, '1', 21600);
  return { token: token };
}

function requireAdmin_(token) {
  if (!token || !CacheService.getScriptCache().get('adm:' + token)) {
    throw new Error('ADMIN_AUTH: 관리자 로그인이 만료되었어요. 다시 PIN을 입력하세요.');
  }
}

function apiAdminState(token) {
  requireAdmin_(token);
  var ctx = loadCtx_();
  var s = ctx.settings;
  var world = readTable_('World_Buildings');
  var exported = readTable_('Export_Points');
  return {
    settingsRows: readTable_('Settings').map(function (r) { return { key: r.key, value: r.value, note: r.note }; }),
    flags: {
      1: truthy_(s.STAGE1_OPEN), 2: truthy_(s.STAGE2_OPEN), 3: truthy_(s.STAGE3_OPEN), 4: truthy_(s.STAGE4_OPEN),
      voting: truthy_(s.VOTING_OPEN), results: truthy_(s.RESULTS_PUBLIC)
    },
    className: s.CLASS_NAME || '',
    coins: num_(s.COINS_PER_STUDENT, 10),
    roles: ROLES,
    designFields: DESIGN_FIELDS,
    responseFields: RESPONSE_FIELDS,
    dashboard: buildDashboard_(ctx),
    unassigned: ctx.students.filter(function (st) {
      return !ctx.teams.some(function (t) { return t.id === st.team; });
    }).map(function (st) { return { no: st.no, name: st.name, team: st.team }; }),
    climates: ctx.climates.map(function (c) {
      return { name: c.name, desc: c.desc, life: c.life, region: c.region, icon: c.icon, color: c.color, active: truthy_(c.active) };
    }),
    disasters: ctx.disasters.map(function (d) {
      return { id: d.id, climate: d.climate, name: d.name, story: d.story, question: d.question, active: truthy_(d.active) };
    }),
    results: computeResults_(ctx),
    voteCount: Object.keys(votedSet_(ctx)).length,
    studentCount: ctx.students.length,
    world: world.map(function (w) { delete w._row; return w; }),
    exported: exported.map(function (e) { delete e._row; return e; }),
    sheetUrl: ss_().getUrl()
  };
}

/* ---------- 명단·팀 ---------- */

/**
 * text: 한 줄에 "번호, 이름, 팀" (쉼표 또는 탭). 팀 칸이 비면 자동 배정.
 * assign: 'order'(번호 순서대로 묶기) | 'random'
 */
function apiAdminSaveRoster(token, text, teamCount, assign) {
  requireAdmin_(token);
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
  var people = [];
  var seen = {};
  lines.forEach(function (line) {
    var parts = line.split(/\t|,/).map(function (p) { return p.trim(); });
    var no = parseInt(parts[0], 10);
    if (isNaN(no) || !parts[1]) return; // 머리글 줄 등은 건너뜀
    if (seen[no]) throw new Error(no + '번이 두 번 들어 있어요.');
    seen[no] = true;
    var tm = String(parts[2] || '').match(/\d+/);
    people.push({ no: no, name: parts[1], teamNo: tm ? parseInt(tm[0], 10) : 0 });
  });
  if (!people.length) throw new Error('명단을 읽지 못했어요. "번호, 이름, 팀" 형식으로 한 줄에 한 명씩 넣어 주세요.');

  var n = Math.max(1, Math.min(12, parseInt(teamCount, 10) || 6));
  people.forEach(function (p) { if (p.teamNo > n) n = p.teamNo; });

  var need = people.filter(function (p) { return !p.teamNo; });
  if (need.length) {
    if (assign === 'random') {
      for (var i = need.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = need[i]; need[i] = need[j]; need[j] = tmp;
      }
      need.forEach(function (p, k) { p.teamNo = (k % n) + 1; });
    } else {
      need.sort(function (a, b) { return a.no - b.no; });
      var size = Math.ceil(need.length / n);
      need.forEach(function (p, k) { p.teamNo = Math.floor(k / size) + 1; });
    }
  }

  withLock_(function () {
    var oldTeams = readTableFresh_('Teams');
    var oldStudents = readTableFresh_('Students');
    var used = {};
    oldTeams.forEach(function (t) { if (t.code) used[String(t.code).toUpperCase()] = true; });
    var teams = [];
    for (var k = 1; k <= n; k++) {
      var id = 'T' + k;
      var old = oldTeams.filter(function (t) { return t.id === id; })[0];
      if (old) {
        var copy = {};
        SCHEMA.Teams.fields.forEach(function (f) { copy[f[0]] = old[f[0]]; });
        if (!copy.code) copy.code = newTeamCode_(used);
        teams.push(copy);
      } else {
        teams.push({ id: id, name: k + '팀', code: newTeamCode_(used) });
      }
    }
    var students = people.sort(function (a, b) { return a.no - b.no; }).map(function (p) {
      var teamId = 'T' + p.teamNo;
      var old = oldStudents.filter(function (s) { return String(s.no) === String(p.no) && s.team === teamId; })[0];
      return { no: p.no, name: p.name, team: teamId, role: old ? old.role : '', lastSeen: old ? old.lastSeen : '' };
    });
    clearBody_('Teams');
    appendObjs_('Teams', teams);
    clearBody_('Students');
    appendObjs_('Students', students);
    bump_(['Teams', 'Students']);
  });
  return apiAdminState(token);
}

function apiAdminRegenCodes(token, teamId) {
  requireAdmin_(token);
  withLock_(function () {
    var teams = readTableFresh_('Teams');
    var used = {};
    teams.forEach(function (t) { if (t.code) used[String(t.code).toUpperCase()] = true; });
    teams.forEach(function (t) {
      if (!teamId || t.id === teamId) setCells_('Teams', t._row, { code: newTeamCode_(used) });
    });
    bump_('Teams');
  });
  return apiAdminState(token);
}

function apiAdminSetRole(token, no, roleId) {
  requireAdmin_(token);
  withLock_(function () {
    var st = readTableFresh_('Students').filter(function (s) { return String(s.no) === String(no); })[0];
    if (!st) throw new Error('학생을 찾을 수 없어요.');
    var role = roleId ? roleById_(roleId) : null;
    setCells_('Students', st._row, { role: role ? role.name : '' });
    bump_('Students');
  });
  return apiAdminState(token);
}

/* ---------- 단계 ---------- */

var EDITABLE_FLAGS = { STAGE1_OPEN: 1, STAGE2_OPEN: 1, STAGE3_OPEN: 1, STAGE4_OPEN: 1, VOTING_OPEN: 1, RESULTS_PUBLIC: 1 };

function apiAdminSetSetting(token, key, value) {
  requireAdmin_(token);
  key = String(key || '').trim();
  if (!key) throw new Error('설정 키가 없어요.');
  if (key === 'ADMIN_PIN' && String(value).trim().length < 4) throw new Error('PIN은 4자리 이상이어야 해요.');
  if (EDITABLE_FLAGS[key]) value = !!value && value !== 'false';
  else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) && /^(POINT_|COINS_)/.test(key)) value = Number(value);
  withLock_(function () { setSetting_(key, value); });
  return apiAdminState(token);
}

function apiAdminSetOverride(token, teamId, n, value) {
  requireAdmin_(token);
  if ([1, 2, 3, 4].indexOf(Number(n)) < 0) throw new Error('단계 번호가 올바르지 않아요.');
  if (['', OVERRIDE_OPEN, OVERRIDE_LOCK].indexOf(value) < 0) throw new Error('값이 올바르지 않아요.');
  withLock_(function () {
    var team = readTableFresh_('Teams').filter(function (t) { return t.id === teamId; })[0];
    if (!team) throw new Error('팀을 찾을 수 없어요.');
    var obj = {};
    obj['s' + n] = value;
    setCells_('Teams', team._row, obj);
    bump_('Teams');
  });
  return apiAdminState(token);
}

/* ---------- 기후·재난 ---------- */

function apiAdminResetClimate(token, teamId) {
  requireAdmin_(token);
  withLock_(function () {
    var team = readTableFresh_('Teams').filter(function (t) { return t.id === teamId; })[0];
    if (!team) throw new Error('팀을 찾을 수 없어요.');
    setCells_('Teams', team._row, { climate: '', disaster: '', updated: now_() });
    bump_('Teams');
  });
  return apiAdminState(token);
}

/** 재난 카드가 없는 팀 모두에게 무작위 배부 */
function apiAdminDistributeDisasters(token) {
  requireAdmin_(token);
  var count = 0;
  withLock_(function () {
    var teams = readTableFresh_('Teams');
    var disasters = readTableFresh_('Disasters');
    teams.forEach(function (t) {
      if (!t.id || !t.climate || t.disaster) return;
      var d = pickDisaster_(t, teams, disasters);
      if (!d) return;
      assignDisaster_(t, d);
      t.disaster = d.id;
      count++;
    });
    bump_(['Teams', 'DisasterResponses']);
  });
  var st = apiAdminState(token);
  st.message = count ? count + '개 팀에 재난 카드를 배부했어요.' : '새로 배부할 팀이 없어요. (기후를 뽑았고 재난 카드가 없는 팀만 배부)';
  return st;
}

function apiAdminSetTeamDisaster(token, teamId, disasterId) {
  requireAdmin_(token);
  withLock_(function () {
    var team = readTableFresh_('Teams').filter(function (t) { return t.id === teamId; })[0];
    if (!team) throw new Error('팀을 찾을 수 없어요.');
    var d = null;
    if (disasterId) {
      d = readTableFresh_('Disasters').filter(function (x) { return x.id === disasterId; })[0];
      if (!d) throw new Error('재난 카드를 찾을 수 없어요.');
    }
    assignDisaster_(team, d);
    bump_(['Teams', 'DisasterResponses']);
  });
  return apiAdminState(token);
}

var CARD_SHEETS = {
  Climates: { idKey: 'name', keys: ['desc', 'life', 'region', 'icon', 'color', 'active'] },
  Disasters: { idKey: 'id', keys: ['climate', 'name', 'story', 'question', 'active'] }
};

function apiAdminSaveCard(token, sheetName, id, obj) {
  requireAdmin_(token);
  var def = CARD_SHEETS[sheetName];
  if (!def) throw new Error('수정할 수 없는 시트예요.');
  withLock_(function () {
    var row = readTableFresh_(sheetName).filter(function (r) { return String(r[def.idKey]) === String(id); })[0];
    if (!row) throw new Error('카드를 찾을 수 없어요.');
    var upd = {};
    def.keys.forEach(function (k) {
      if (!obj.hasOwnProperty(k)) return;
      upd[k] = k === 'active' ? !!obj[k] : clip_(obj[k], 800);
    });
    setCells_(sheetName, row._row, upd);
    bump_(sheetName);
  });
  return apiAdminState(token);
}

/* ---------- 투표·결과·포인트·월드 ---------- */

function apiAdminResetVote(token, no) {
  requireAdmin_(token);
  withLock_(function () {
    var sh = sheet_('Votes');
    var rows = readTableFresh_('Votes').filter(function (v) { return String(v.voterNo) === String(no); });
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    bump_('Votes');
  });
  return apiAdminState(token);
}

function apiAdminExportPoints(token) {
  requireAdmin_(token);
  var ctx = loadCtx_();
  var rows = computePoints_(ctx);
  var at = now_();
  withLock_(function () {
    clearBody_('Export_Points');
    appendObjs_('Export_Points', rows.map(function (r) { r.calcAt = at; r.sync = ''; return r; }));
    bump_('Export_Points');
  });
  var st = apiAdminState(token);
  st.message = '학생 ' + Object.keys(rows.reduce(function (m, r) { m[r.no] = 1; return m; }, {})).length +
    '명, ' + rows.length + '건을 Export_Points 탭에 기록했어요.';
  return st;
}

function apiAdminRegisterWorld(token, teamId) {
  requireAdmin_(token);
  var ctx = loadCtx_();
  var r = computeResults_(ctx).filter(function (x) { return x.id === teamId; })[0];
  if (!r) throw new Error('기후를 뽑은 팀만 등록할 수 있어요.');
  var obj = { team: r.id, city: r.city, climate: r.climate, intro: r.intro || '', poster: r.poster || '', votes: r.coins, regAt: now_() };
  withLock_(function () {
    var same = readTableFresh_('World_Buildings').filter(function (w) {
      return w.team === obj.team && String(w.city) === String(obj.city);
    })[0];
    if (same) setCells_('World_Buildings', same._row, obj);
    else appendObj_('World_Buildings', obj);
    bump_('World_Buildings');
  });
  var st = apiAdminState(token);
  st.message = '"' + obj.city + '"을(를) World_Buildings 탭에 등록했어요.';
  return st;
}

/** 전체 초기화. 명단·기후/재난 카드·World_Buildings는 남기는 것이 기본 */
function apiAdminResetAll(token, confirmWord, includeRoster) {
  requireAdmin_(token);
  if (confirmWord !== '초기화') throw new Error('확인 문구가 맞지 않아요.');
  withLock_(function () {
    ['Designs', 'DisasterResponses', 'Votes', 'Export_Points'].forEach(clearBody_);
    if (includeRoster) {
      clearBody_('Students');
      clearBody_('Teams');
      var used = {};
      var rows = [];
      for (var i = 1; i <= 6; i++) rows.push({ id: 'T' + i, name: i + '팀', code: newTeamCode_(used) });
      appendObjs_('Teams', rows);
    } else {
      readTableFresh_('Teams').forEach(function (t) {
        setCells_('Teams', t._row, { climate: '', disaster: '', poster: '', s1: '', s2: '', s3: '', s4: '', updated: '' });
      });
      readTableFresh_('Students').forEach(function (s) {
        setCells_('Students', s._row, { role: '', lastSeen: '' });
      });
    }
    setSetting_('STAGE1_OPEN', true);
    ['STAGE2_OPEN', 'STAGE3_OPEN', 'STAGE4_OPEN', 'VOTING_OPEN', 'RESULTS_PUBLIC'].forEach(function (k) { setSetting_(k, false); });
    bump_(SHEET_ORDER);
  });
  var st = apiAdminState(token);
  st.message = '초기화했어요.';
  return st;
}

function apiAdminCheckSchema(token) {
  requireAdmin_(token);
  withLock_(function () { ensureSchema_(); });
  var st = apiAdminState(token);
  st.message = '시트 구조를 점검했어요. 빠진 탭·열이 있으면 새로 만들었어요.';
  return st;
}

// ===== Api.gs =====
/**
 * Api.gs — GitHub Pages 화면이 보내는 요청을 받는 입구
 *
 * 화면은 fetch(API_URL, { method: 'POST', body: JSON.stringify({ fn, args }) })로 부른다.
 * Content-Type을 text/plain으로 보내야 브라우저 사전 확인(preflight) 없이 호출된다.
 * 응답: { ok: true, data } 또는 { ok: false, error }
 */

function routes_() {
  return {
    // 학생
    lookupTeam: apiLookupTeam,
    login: apiLogin,
    state: apiState,
    drawClimate: apiDrawClimate,
    chooseRole: apiChooseRole,
    saveDesign: apiSaveDesign,
    drawDisaster: apiDrawDisaster,
    saveResponse: apiSaveResponse,
    submitPoster: apiSubmitPoster,
    submitVote: apiSubmitVote,
    // 교사
    adminLogin: apiAdminLogin,
    adminState: apiAdminState,
    adminSaveRoster: apiAdminSaveRoster,
    adminRegenCodes: apiAdminRegenCodes,
    adminSetRole: apiAdminSetRole,
    adminSetSetting: apiAdminSetSetting,
    adminSetOverride: apiAdminSetOverride,
    adminResetClimate: apiAdminResetClimate,
    adminDistributeDisasters: apiAdminDistributeDisasters,
    adminSetTeamDisaster: apiAdminSetTeamDisaster,
    adminSaveCard: apiAdminSaveCard,
    adminResetVote: apiAdminResetVote,
    adminExportPoints: apiAdminExportPoints,
    adminRegisterWorld: apiAdminRegisterWorld,
    adminResetAll: apiAdminResetAll,
    adminCheckSchema: apiAdminCheckSchema
  };
}

function handle_(fnName, args) {
  try {
    var fn = routes_()[fnName];
    if (!fn) throw new Error('알 수 없는 요청이에요: ' + fnName);
    ensureSchemaIfNeeded_();
    return { ok: true, data: fn.apply(null, args || []) };
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    console.error(fnName + ': ' + msg);
    return { ok: false, error: msg };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '요청 형식이 잘못되었어요.' }); }
  return json_(handle_(req.fn, req.args));
}

/** 주소를 브라우저로 열었을 때: 연결 확인용 */
function doGet(e) {
  var fn = e && e.parameter && e.parameter.fn;
  if (fn === 'ping' || !fn) {
    return json_({ ok: true, data: { app: '2050 기후 도시 엑스포', schema: SCHEMA_VERSION, time: new Date().toISOString() } });
  }
  return json_({ ok: false, error: 'POST로 호출하세요.' });
}
