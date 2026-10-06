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
  list.sort(function (a, b) { return b.coins - a.coins || a.id.localeCompare(b.id, 'ko', { numeric: true }); });
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
