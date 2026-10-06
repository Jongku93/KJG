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
