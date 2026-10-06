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
 * text: 한 줄에 "번호, 이름, 기후" 또는 "번호, 이름, 팀번호" (쉼표 또는 탭).
 * - 기후 이름(열대·건조…)을 쓰면 같은 기후끼리 한 팀이 되고 팀 기후도 정해진다. (경매로 정한 결과를 그대로 넣기)
 * - 팀번호를 쓰거나 비우면 예전처럼 팀만 나누고, 기후는 교사 화면에서 따로 정한다.
 * assign: 팀번호를 비웠을 때 'order'(번호 순서대로 묶기) | 'random'
 */
function apiAdminSaveRoster(token, text, teamCount, assign) {
  requireAdmin_(token);
  var climateNames = readTableFresh_('Climates').map(function (c) { return String(c.name).trim(); }).filter(String);
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
  var people = [];
  var seen = {};
  var badClimate = [];
  lines.forEach(function (line) {
    var parts = line.split(/\t|,/).map(function (p) { return p.trim(); });
    var no = parseInt(parts[0], 10);
    if (isNaN(no) || !parts[1]) return; // 머리글 줄 등은 건너뜀
    if (seen[no]) throw new Error(no + '번이 두 번 들어 있어요.');
    seen[no] = true;
    var third = String(parts[2] || '').trim();
    var climate = climateNames.filter(function (c) { return third === c || third === c + '팀' || third === c + ' 팀' || third === c + '기후'; })[0] || '';
    var tm = climate ? null : third.match(/^\d+/);
    if (third && !climate && !tm) badClimate.push(no + '번 "' + third + '"');
    people.push({ no: no, name: parts[1], climate: climate, teamNo: tm ? parseInt(tm[0], 10) : 0 });
  });
  if (badClimate.length) throw new Error('세 번째 칸을 알아볼 수 없어요: ' + badClimate.join(', ') + ' — 기후 이름(' + climateNames.join('·') + ') 또는 팀번호를 넣어 주세요.');
  if (!people.length) throw new Error('명단을 읽지 못했어요. "번호, 이름, 기후" 형식으로 한 줄에 한 명씩 넣어 주세요.');

  var byClimate = people.filter(function (p) { return p.climate; }).length;
  if (byClimate && byClimate < people.length) {
    var miss = people.filter(function (p) { return !p.climate; }).map(function (p) { return p.no + '번'; });
    throw new Error('기후가 빠진 학생이 있어요: ' + miss.join(', ') + ' (기후로 넣을 때는 모든 학생에게 기후를 적어 주세요)');
  }
  var climateMode = byClimate > 0;

  withLock_(function () {
    var oldTeams = readTableFresh_('Teams');
    var oldStudents = readTableFresh_('Students');
    var used = {};
    oldTeams.forEach(function (t) { if (t.code) used[String(t.code).toUpperCase()] = true; });
    var copyOf = function (old) {
      var c = {};
      SCHEMA.Teams.fields.forEach(function (f) { c[f[0]] = old[f[0]]; });
      if (!c.code) c.code = newTeamCode_(used);
      return c;
    };
    var teams = [];
    var teamIdOf = {}; // 학생 번호 → 팀ID

    if (climateMode) {
      // 기후 순서(Climates 탭 순서)대로 팀을 만들고, 같은 기후였던 팀은 코드·재난·포스터를 이어받음
      var present = climateNames.filter(function (c) { return people.some(function (p) { return p.climate === c; }); });
      var takenIds = {};
      var plan = present.map(function (c) {
        var old = oldTeams.filter(function (t) { return t.climate === c && !takenIds[t.id]; })[0];
        if (old) takenIds[old.id] = true;
        return { climate: c, old: old };
      });
      var nextId = 1;
      plan.forEach(function (pl) {
        if (pl.old) { pl.id = pl.old.id; return; }
        while (takenIds['T' + nextId]) nextId++;
        pl.id = 'T' + nextId;
        takenIds[pl.id] = true;
      });
      plan.sort(function (a, b) { return Number(a.id.slice(1)) - Number(b.id.slice(1)); });
      plan.forEach(function (pl) {
        var row;
        if (pl.old) row = copyOf(pl.old);
        else {
          var sameId = oldTeams.filter(function (t) { return t.id === pl.id; })[0];
          row = { id: pl.id, code: sameId && sameId.code ? sameId.code : newTeamCode_(used) };
        }
        row.climate = pl.climate;
        if (!pl.old) row.name = pl.climate + '팀';
        else if (!row.name) row.name = pl.climate + '팀';
        teams.push(row);
        people.forEach(function (p) { if (p.climate === pl.climate) teamIdOf[p.no] = pl.id; });
      });
    } else {
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
      for (var k = 1; k <= n; k++) {
        var id = 'T' + k;
        var old = oldTeams.filter(function (t) { return t.id === id; })[0];
        teams.push(old ? copyOf(old) : { id: id, name: k + '팀', code: newTeamCode_(used) });
      }
      people.forEach(function (p) { teamIdOf[p.no] = 'T' + p.teamNo; });
    }

    var students = people.sort(function (a, b) { return a.no - b.no; }).map(function (p) {
      var teamId = teamIdOf[p.no];
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

/** 팀 기후 정하기(경매 결과 입력). '' = 비우기. 다른 팀과 겹치면 안 됨 */
function apiAdminSetClimate(token, teamId, climate) {
  requireAdmin_(token);
  climate = String(climate || '').trim();
  withLock_(function () {
    var teams = readTableFresh_('Teams');
    var team = teams.filter(function (t) { return t.id === teamId; })[0];
    if (!team) throw new Error('팀을 찾을 수 없어요.');
    if (climate) {
      var c = readTableFresh_('Climates').filter(function (x) { return String(x.name).trim() === climate; })[0];
      if (!c) throw new Error('없는 기후예요: ' + climate);
      var other = teams.filter(function (t) { return t.id !== teamId && t.climate === climate; })[0];
      if (other) throw new Error(climate + ' 기후는 이미 ' + other.name + '이(가) 맡았어요. 그 팀 기후를 먼저 바꿔 주세요.');
    }
    var upd = { climate: climate, updated: now_() };
    // 재난 카드가 이전 기후 것이면 비움(공통 와일드카드는 유지)
    if (team.disaster && team.climate !== climate) {
      var d = readTableFresh_('Disasters').filter(function (x) { return x.id === team.disaster; })[0];
      if (!d || d.climate !== WILD) upd.disaster = '';
    }
    setCells_('Teams', team._row, upd);
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
  if (!r) throw new Error('기후가 정해진 팀만 등록할 수 있어요.');
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
