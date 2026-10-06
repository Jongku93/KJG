/* 2050 기후 도시 엑스포 — 교사 관리자 화면 */
(function () {
  'use strict';
  var E = window.Expo;
  var esc = E.esc, escBr = E.escBr, $ = E.$, $all = E.$all, toast = E.toast;

  var A = { token: null, st: null, tab: 'dash', timer: null };
  try { A.token = sessionStorage.getItem('expo_admin'); } catch (e) { A.token = null; }

  var TABS = [
    ['dash', '📊 진행 현황'],
    ['stages', '🔓 단계·재난'],
    ['roster', '👥 명단·팀 코드'],
    ['vote', '🪙 투표·결과'],
    ['points', '🏅 포인트·월드'],
    ['cards', '🃏 카드 편집'],
    ['settings', '⚙️ 설정·초기화']
  ];
  var STAGE_NAMES = { 1: '뽑는다', 2: '짓는다', 3: '버틴다', 4: '자랑한다' };
  var FLAG_INFO = [
    ['STAGE1_OPEN', 1, '1단계 뽑는다', '기후 카드 뽑기 · 직책 정하기'],
    ['STAGE2_OPEN', 2, '2단계 짓는다', '직책별 설계 기록'],
    ['STAGE3_OPEN', 3, '3단계 버틴다', '재난 경보! 재난 카드 뽑기 · 대응 작성'],
    ['STAGE4_OPEN', 4, '4단계 자랑한다', 'Canva 포스터 제출 · 엑스포 관람'],
    ['VOTING_OPEN', 'voting', '투자 투표 열기', '1인당 코인을 다른 팀에 나눠 투자'],
    ['RESULTS_PUBLIC', 'results', '결과 공개', '학생 화면에 순위와 우승 도시 발표']
  ];

  /* ---------- 서버 호출 ---------- */

  async function call(fn) {
    var args = [fn, A.token].concat(Array.prototype.slice.call(arguments, 1));
    try {
      return await E.api.apply(null, args);
    } catch (e) {
      if (/ADMIN_AUTH/.test(e.message)) {
        logout(true);
        throw new Error('로그인이 만료되었어요. PIN을 다시 입력하세요.');
      }
      throw e;
    }
  }

  /** 버튼 동작 → 새 상태 반영 */
  async function act(btn, fn) {
    var rest = Array.prototype.slice.call(arguments, 2);
    var st = await E.busy(btn, function () { return call.apply(null, [fn].concat(rest)); });
    setState(st);
    if (st && st.message) toast(st.message, 'ok');
    return st;
  }

  function setState(st) {
    if (!st) return;
    A.st = st;
    render();
  }

  async function refresh(quiet) {
    try {
      var st = await call('adminState');
      A.st = st;
      if (quiet) softRender(); else render();
    } catch (e) {
      if (!quiet) toast(e.message, 'error');
    }
  }

  function logout(silent) {
    A.token = null;
    try { sessionStorage.removeItem('expo_admin'); } catch (e) { /* */ }
    clearInterval(A.timer);
    renderLogin();
    if (!silent) toast('로그아웃했어요.');
  }

  /* ---------- 로그인 ---------- */

  function renderLogin() {
    $('#app').innerHTML =
      '<div class="login"><div class="panel card">' +
      '<div class="section-label">TEACHER CONSOLE</div>' +
      '<div class="hero-title"><span>2050 기후 도시</span><br>엑스포 관리</div>' +
      '<p class="muted" style="margin-top:10px">교사용 PIN을 입력하세요. (처음 PIN은 1234, Settings 탭에서 바꿀 수 있어요)</p>' +
      (E.apiUrl() ? '' : '<p class="chip bad">config.js에 API_URL이 비어 있어요. README를 보고 먼저 설정하세요.</p>') +
      '<form id="pinForm" class="stack" style="margin-top:14px">' +
      '<input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN" class="code-input" style="letter-spacing:.3em">' +
      '<button class="btn primary lg block" type="submit">입장</button></form>' +
      '<p class="tiny muted" style="margin-top:14px">학생 화면: <a href="index.html">index.html</a></p>' +
      '</div></div>';
    $('#pinForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = ev.target.querySelector('button');
      try {
        var r = await E.busy(btn, function () { return E.api('adminLogin', $('#pin').value); });
        A.token = r.token;
        try { sessionStorage.setItem('expo_admin', r.token); } catch (e) { /* */ }
        await refresh();
        startTimer();
      } catch (e) { $('#pin').value = ''; }
    });
  }

  function startTimer() {
    clearInterval(A.timer);
    A.timer = setInterval(function () {
      if (document.hidden || !A.token) return;
      if (['dash', 'vote', 'stages'].indexOf(A.tab) < 0) return;
      if ($('.modal-bg') || $('.fullscreen')) return;
      var a = document.activeElement;
      if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
      refresh(true);
    }, 12000);
  }

  /* ---------- 틀 ---------- */

  function render() {
    if (!A.st) return;
    if (!$('#adminShell')) {
      $('#app').innerHTML =
        '<div id="adminShell">' +
        '<header class="topbar"><div class="wrap">' +
        '<div class="brand"><div class="logo">2050</div><div>기후 도시 엑스포 <small id="clsName"></small></div></div>' +
        '<div class="who">' +
        '<button class="btn sm ghost" id="btnRefresh" title="새로고침">⟳<span class="hide-sm"> 새로고침</span></button>' +
        '<a class="btn sm ghost hide-sm" href="index.html" target="_blank" rel="noopener">학생 화면</a>' +
        '<button class="btn sm ghost" id="btnLogout">로그아웃</button>' +
        '</div></div>' +
        '<nav class="tabs" id="tabs"></nav></header>' +
        '<main class="wrap" id="view"></main></div>';
      $('#btnRefresh').addEventListener('click', function (e) { E.busy(e.currentTarget, function () { return refresh(); }); });
      $('#btnLogout').addEventListener('click', function () { logout(); });
      $('#tabs').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab]');
        if (!b) return;
        A.tab = b.dataset.tab;
        render();
        window.scrollTo(0, 0);
      });
    }
    $('#clsName').textContent = (A.st.className || '') + ' · 교사 화면';
    $('#tabs').innerHTML = TABS.map(function (t) {
      return '<button class="tab ' + (A.tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var view = $('#view');
    view.innerHTML = VIEWS[A.tab]();
    if (BIND[A.tab]) BIND[A.tab](view);
  }

  /** 자동 새로고침: 스크롤 위치 유지 */
  function softRender() {
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  /* ---------- 도우미 ---------- */

  function climateBadge(info, name) {
    if (!name) return '<span class="chip">기후 미정</span>';
    var c = info || {};
    return '<span class="climate-badge" style="--c:' + esc(c.color || '#3a4a70') + '">' + esc(c.icon || '') + ' ' + esc(name) + '</span>';
  }
  function roleName(id) {
    var r = (A.st.roles || []).filter(function (x) { return x.id === id; })[0];
    return r ? r.icon + ' ' + r.name : '';
  }
  function climateInfo(name) { return (A.st.climates || []).filter(function (c) { return c.name === name; })[0]; }
  function sw(id, checked) {
    return '<label class="switch"><input type="checkbox" data-flag="' + id + '" ' + (checked ? 'checked' : '') + '><span></span></label>';
  }
  function teamOpts(selected, list) {
    return list.map(function (t) {
      return '<option value="' + esc(t.id) + '" ' + (t.id === selected ? 'selected' : '') + '>' + esc(t.name) + (t.city && t.city !== t.name ? ' · ' + esc(t.city) : '') + '</option>';
    }).join('');
  }

  /* ---------- 진행 현황 ---------- */

  function viewDash() {
    var st = A.st, d = st.dashboard;
    var count = function (n) { return d.filter(function (t) { return t.stages[n - 1].done; }).length; };
    var flags = st.flags;
    var html = '<div class="row between" style="margin:6px 0 14px"><h2 style="margin:0">진행 현황</h2>' +
      '<span class="tiny muted">12초마다 자동 새로고침</span></div>' +
      '<div class="stats">' +
      stat('팀', d.length + '팀') + stat('학생', st.studentCount + '명') +
      stat('1단계 완료', count(1) + ' / ' + d.length) + stat('2단계 완료', count(2) + ' / ' + d.length) +
      stat('재난 대응 완료', count(3) + ' / ' + d.length) + stat('포스터 제출', count(4) + ' / ' + d.length) +
      stat('투표', st.voteCount + ' / ' + st.studentCount) +
      '</div>' +
      '<div class="row" style="margin:14px 0">' + FLAG_INFO.map(function (f) {
        var on = flags[f[1]];
        return '<span class="chip ' + (on ? 'accent' : '') + '">' + (on ? '🔓 ' : '🔒 ') + esc(f[2]) + '</span>';
      }).join('') + '</div>';
    if (st.unassigned.length) {
      html += '<div class="card flat" style="border-color:var(--warn)"><b>⚠ 팀이 없는 학생</b>: ' +
        st.unassigned.map(function (s) { return esc(s.no + ' ' + s.name + '(' + s.team + ')'); }).join(', ') +
        ' — Students 탭의 팀ID를 확인하세요.</div>';
    }
    html += '<div class="team-grid">' + d.map(teamCard).join('') + '</div>';
    return html;
  }

  function stat(label, val) { return '<div class="stat"><span class="tiny muted">' + esc(label) + '</span><b>' + esc(val) + '</b></div>'; }

  function teamCard(t) {
    var openMissing = [];
    t.stages.forEach(function (s) {
      if (s.open && !s.done) s.missing.forEach(function (m) { openMissing.push(s.n + '단계: ' + m); });
    });
    var shown = openMissing.slice(0, 8);
    return '<div class="card flat">' +
      '<div class="row between"><div class="row"><h3 style="margin:0">' + esc(t.name) + '</h3>' + climateBadge(t.climateInfo, t.climate) + '</div>' +
      '<span class="chip" title="팀 코드">🔑 ' + esc(t.code) + '</span></div>' +
      '<div style="margin:6px 0 8px;font-weight:700">' + (t.design.city_name ? '🏙️ ' + esc(t.design.city_name) : '<span class="muted">도시 이름 없음</span>') + '</div>' +
      '<div class="stage-pills">' + t.stages.map(function (s) {
        return '<span class="stage-pill ' + (s.done ? 'done' : (s.open ? 'open' : '')) + '">' + s.n + ' ' + STAGE_NAMES[s.n] + ' ' + (s.done ? '✓' : (s.open ? '🔓' : '🔒')) + '</span>';
      }).join('') + '</div>' +
      (shown.length ? '<div class="miss" style="margin-top:8px">' + shown.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
        (openMissing.length > shown.length ? '<span>외 ' + (openMissing.length - shown.length) + '칸</span>' : '') + '</div>' : '') +
      '<div class="small" style="margin-top:10px">' + t.members.map(function (m) {
        return '<div>' + esc(m.no) + '. ' + esc(m.name) + ' <span class="muted">' + (m.role ? esc(roleName(m.role)) : '직책 없음') + '</span>' +
          (A.st.flags[2] ? (m.stage2 ? ' <span class="chip ok tiny">설계✓</span>' : '') : '') +
          (A.st.flags.voting ? (m.voted ? ' <span class="chip ok tiny">투표✓</span>' : ' <span class="chip warn tiny">미투표</span>') : '') + '</div>';
      }).join('') + '</div>' +
      '<div class="small muted" style="margin-top:8px">' +
      (t.disaster ? '🌪️ ' + esc(t.disaster.name) : '재난 카드 없음') +
      (t.poster ? ' · <a href="' + esc(t.poster) + '" target="_blank" rel="noopener">포스터 열기</a>' : '') + '</div>' +
      '<div style="margin-top:10px"><button class="btn sm" data-detail="' + esc(t.id) + '">설계 전체 보기</button></div>' +
      '</div>';
  }

  function showDetail(teamId) {
    var t = A.st.dashboard.filter(function (x) { return x.id === teamId; })[0];
    if (!t) return;
    var val = function (k) { return t.design[k] ? escBr(t.design[k]) : '<span class="muted">(비어 있음)</span>'; };
    var html = '<div class="row">' + climateBadge(t.climateInfo, t.climate) + '<b>' + esc(t.design.city_name || '') + '</b></div>' +
      '<p class="muted">' + esc(t.design.intro || '') + '</p>' +
      A.st.roles.map(function (r) {
        return '<div class="detail-section"><h4>' + r.icon + ' ' + esc(r.name) + '</h4>' +
          '<p><b>만든 것</b> ' + val(r.id + '_what') + '</p><p class="why"><b>이 기후라서</b> ' + val(r.id + '_why') + '</p></div>';
      }).join('') +
      '<div class="detail-section"><h4>🏺 전통 계승</h4><p><b>계승한 것</b> ' + val('tradition_keep') + '</p><p><b>미래식으로</b> ' + val('tradition_future') + '</p></div>' +
      '<div class="detail-section"><h4>🤖 AI 사용 기록</h4><p><b>질문</b> ' + val('ai_question') + '</p><p><b>고친 것</b> ' + val('ai_fix') + '</p></div>' +
      '<div class="detail-section"><h4>🌪️ 재난: ' + esc(t.disaster ? t.disaster.name : '없음') + '</h4>' +
      '<p><b>버티는 방법</b> ' + (t.response.survive ? escBr(t.response.survive) : '<span class="muted">(비어 있음)</span>') + '</p>' +
      '<p><b>고친 점</b> ' + (t.response.fix ? escBr(t.response.fix) : '<span class="muted">(비어 있음)</span>') + '</p></div>';
    E.modal({ title: t.name + ' 설계 기록', html: html, wide: true, buttons: [{ label: '닫기', value: true }] });
  }

  /* ---------- 단계·재난 ---------- */

  function viewStages() {
    var st = A.st;
    var html = '<div class="card"><div class="card-title"><h2>반 전체 단계</h2></div>' +
      '<p class="small muted">켜면 모든 팀에 열려요. 앞 단계는 잠그지 않고 열어 두는 것을 권장해요(재난 단계에서 설계를 고칠 수 있도록).</p>' +
      FLAG_INFO.map(function (f) {
        return '<div class="flag-row">' + sw(f[0], st.flags[f[1]]) + '<div class="grow"><b>' + esc(f[2]) + '</b><div class="small muted">' + esc(f[3]) + '</div></div></div>';
      }).join('') + '</div>';

    html += '<div class="card"><div class="card-title"><h2>팀별로 열기·잠그기</h2></div>' +
      '<p class="small muted">"반 설정"이면 위 스위치를 따르고, 열림/잠김을 고르면 그 팀만 다르게 적용돼요.</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>팀</th><th>기후</th>' +
      [1, 2, 3, 4].map(function (n) { return '<th>' + n + '단계</th>'; }).join('') + '</tr></thead><tbody>' +
      st.dashboard.map(function (t) {
        return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + climateBadge(t.climateInfo, t.climate) + '</td>' +
          [1, 2, 3, 4].map(function (n) {
            var v = t.overrides[n] || '';
            return '<td><select data-ov="' + esc(t.id) + '" data-n="' + n + '">' +
              '<option value="" ' + (v === '' ? 'selected' : '') + '>반 설정 (' + (st.flags[n] ? '열림' : '잠김') + ')</option>' +
              '<option value="열림" ' + (v === '열림' ? 'selected' : '') + '>열림</option>' +
              '<option value="잠김" ' + (v === '잠김' ? 'selected' : '') + '>잠김</option></select></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></div>';

    html += '<div class="card"><div class="card-title"><h2>🌪️ 재난 카드</h2></div>' +
      '<p class="small muted">3단계를 열면 각 팀이 직접 뽑을 수 있어요. 한꺼번에 나눠 주려면 [재난 카드 배부]를 누르세요. 우리 기후 카드 2장 + 공통 와일드카드 중 무작위로 나가요.</p>' +
      '<button class="btn gold" id="btnDistribute">🌪️ 재난 카드 배부 (아직 없는 팀)</button>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>팀</th><th>기후</th><th>재난 카드</th><th>기후 카드</th></tr></thead><tbody>' +
      st.dashboard.map(function (t) {
        var pool = st.disasters.filter(function (d) { return d.climate === t.climate || d.climate === '공통'; });
        return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + climateBadge(t.climateInfo, t.climate) + '</td><td>' +
          (t.climate ? '<select data-dis="' + esc(t.id) + '"><option value="">— 없음 —</option>' + pool.map(function (d) {
            return '<option value="' + esc(d.id) + '" ' + (t.disaster && t.disaster.id === d.id ? 'selected' : '') + '>' + esc((d.climate === '공통' ? '[공통] ' : '') + d.name) + '</option>';
          }).join('') + '</select>' : '<span class="muted small">기후 먼저</span>') +
          '</td><td>' + (t.climate ? '<button class="btn sm danger" data-reclimate="' + esc(t.id) + '">기후 다시 뽑게 하기</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html;
  }

  function bindFlags(view) {
    $all('[data-flag]', view).forEach(function (el) {
      el.addEventListener('change', async function () {
        var key = el.dataset.flag;
        var on = el.checked;
        if (key === 'RESULTS_PUBLIC' && on) {
          var ok = await E.confirmBox('결과를 공개할까요?', '<p>학생 화면에 순위와 우승 도시가 바로 보여요.</p>', '공개하기', 'gold');
          if (!ok) { el.checked = false; return; }
        }
        try {
          var st = await call('adminSetSetting', key, on);
          A.st = st;
          toast((on ? '열었어요: ' : '잠갔어요: ') + FLAG_INFO.filter(function (f) { return f[0] === key; })[0][2], 'ok');
          softRender();
        } catch (e) { el.checked = !on; toast(e.message, 'error'); }
      });
    });
  }

  function bindStages(view) {
    bindFlags(view);
    $all('[data-ov]', view).forEach(function (el) {
      el.addEventListener('change', function () {
        act(null, 'adminSetOverride', el.dataset.ov, Number(el.dataset.n), el.value).catch(function () {});
      });
    });
    $all('[data-dis]', view).forEach(function (el) {
      el.addEventListener('change', function () {
        act(null, 'adminSetTeamDisaster', el.dataset.dis, el.value).then(function () { toast('재난 카드를 바꿨어요.', 'ok'); }).catch(function () {});
      });
    });
    $('#btnDistribute', view).addEventListener('click', function (e) { act(e.currentTarget, 'adminDistributeDisasters').catch(function () {}); });
    $all('[data-reclimate]', view).forEach(function (b) {
      b.addEventListener('click', async function () {
        var ok = await E.confirmBox('기후를 비울까요?', '<p>이 팀의 기후와 재난 카드가 비워지고, 1단계에서 다시 뽑을 수 있어요. 적어 둔 설계 내용은 남아요.</p>', '비우기', 'danger solid');
        if (ok) act(b, 'adminResetClimate', b.dataset.reclimate).catch(function () {});
      });
    });
  }

  /* ---------- 명단·팀 코드 ---------- */

  function rosterText() {
    var lines = ['번호,이름,팀'];
    A.st.dashboard.forEach(function (t) {
      t.members.forEach(function (m) { lines.push(m.no + ',' + m.name + ',' + t.id.replace('T', '')); });
    });
    return lines.join('\n');
  }

  function viewRoster() {
    var st = A.st;
    var allMembers = [];
    st.dashboard.forEach(function (t) { t.members.forEach(function (m) { allMembers.push({ m: m, t: t }); }); });
    allMembers.sort(function (a, b) { return Number(a.m.no) - Number(b.m.no); });
    return '<div class="card"><div class="card-title"><h2>명단 입력</h2></div>' +
      '<p class="small muted">한 줄에 한 명씩 <b>번호, 이름, 팀번호</b>. 스프레드시트에서 세 열을 복사해 붙여넣어도 돼요. 팀번호를 비우면 아래 방식으로 자동 배정해요.</p>' +
      '<textarea id="rosterText" rows="10" style="font-family:ui-monospace,monospace">' + esc(rosterText()) + '</textarea>' +
      '<div class="row" style="margin-top:10px">' +
      '<label class="row small">팀 수 <input id="teamCount" type="number" min="1" max="12" value="' + Math.max(st.dashboard.length, 1) + '" style="width:80px"></label>' +
      '<label class="row small">자동 배정 <select id="assignMode" style="width:auto"><option value="order">번호 순서대로 묶기</option><option value="random">무작위</option></select></label>' +
      '<button class="btn primary" id="btnRoster">명단 저장</button></div>' +
      '<p class="tiny muted" style="margin-top:8px">같은 번호·같은 팀이면 고른 직책은 유지돼요. 팀 코드는 바뀌지 않아요.</p></div>' +

      '<div class="card"><div class="card-title"><h2>팀 코드</h2><div class="grow"></div>' +
      '<button class="btn sm gold" id="btnShowCodes">📺 크게 보기</button>' +
      '<button class="btn sm danger" id="btnRegenAll">모든 코드 새로 만들기</button></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>팀</th><th>코드</th><th>팀원</th><th></th></tr></thead><tbody>' +
      st.dashboard.map(function (t) {
        return '<tr><td><b>' + esc(t.name) + '</b></td><td><b style="font-size:1.2rem;letter-spacing:.12em;color:var(--gold)">' + esc(t.code) + '</b></td>' +
          '<td class="small">' + t.members.map(function (m) { return esc(m.no + ' ' + m.name); }).join(', ') + '</td>' +
          '<td><button class="btn sm ghost" data-regen="' + esc(t.id) + '">새 코드</button></td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-title"><h2>학생별 직책·투표</h2></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>번호</th><th>이름</th><th>팀</th><th>직책</th><th>투표</th></tr></thead><tbody>' +
      allMembers.map(function (x) {
        return '<tr><td>' + esc(x.m.no) + '</td><td>' + esc(x.m.name) + '</td><td>' + esc(x.t.name) + '</td>' +
          '<td><select data-role="' + esc(x.m.no) + '"><option value="">— 없음 —</option>' + st.roles.map(function (r) {
            return '<option value="' + r.id + '" ' + (x.m.role === r.id ? 'selected' : '') + '>' + r.icon + ' ' + esc(r.name) + '</option>';
          }).join('') + '</select></td>' +
          '<td>' + (x.m.voted ? '<span class="chip ok">완료</span> <button class="btn sm ghost" data-unvote="' + esc(x.m.no) + '">취소</button>' : '<span class="chip">아직</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="tiny muted">교사가 고르는 직책은 중복 확인을 하지 않아요(팀 인원이 4명이 아닐 때 사용).</p></div>';
  }

  function bindRoster(view) {
    $('#btnRoster', view).addEventListener('click', async function (e) {
      var btn = e.currentTarget;
      var ok = await E.confirmBox('명단을 저장할까요?', '<p>Teams·Students 탭이 이 명단으로 바뀌어요. 팀 수를 줄이면 뒤쪽 팀이 사라져요.</p>', '저장');
      if (ok) act(btn, 'adminSaveRoster', $('#rosterText').value, $('#teamCount').value, $('#assignMode').value)
        .then(function () { toast('명단을 저장했어요.', 'ok'); }).catch(function () {});
    });
    $('#btnRegenAll', view).addEventListener('click', async function (e) {
      var btn = e.currentTarget;
      var ok = await E.confirmBox('모든 팀 코드를 바꿀까요?', '<p>학생들은 새 코드로 다시 로그인해야 해요.</p>', '바꾸기', 'danger solid');
      if (ok) act(btn, 'adminRegenCodes', '').catch(function () {});
    });
    $all('[data-regen]', view).forEach(function (b) {
      b.addEventListener('click', function () { act(b, 'adminRegenCodes', b.dataset.regen).catch(function () {}); });
    });
    $all('[data-role]', view).forEach(function (el) {
      el.addEventListener('change', function () { act(null, 'adminSetRole', el.dataset.role, el.value).then(function () { toast('직책을 바꿨어요.', 'ok'); }).catch(function () {}); });
    });
    $all('[data-unvote]', view).forEach(function (b) {
      b.addEventListener('click', async function () {
        var ok = await E.confirmBox('투표를 취소할까요?', '<p>' + esc(b.dataset.unvote) + '번 학생의 투자 기록이 지워지고 다시 투표할 수 있어요.</p>', '취소하기', 'danger solid');
        if (ok) act(b, 'adminResetVote', b.dataset.unvote).catch(function () {});
      });
    });
    $('#btnShowCodes', view).addEventListener('click', showCodes);
  }

  function showCodes() {
    var url = location.href.replace(/admin\.html.*$/, 'index.html');
    var fs = document.createElement('div');
    fs.className = 'fullscreen';
    fs.innerHTML = '<div class="row between" style="margin-bottom:20px"><div><div class="section-label">TEAM CODES</div>' +
      '<h1 style="font-size:2rem">팀 코드로 입장하세요</h1><p class="muted">' + esc(url) + '</p></div>' +
      '<button class="btn lg" id="closeFs">닫기 ✕</button></div>' +
      '<div class="codes-show">' + A.st.dashboard.map(function (t) {
        return '<div class="c"><div style="font-size:1.4rem;font-weight:800">' + esc(t.name) + '</div><b>' + esc(t.code) + '</b>' +
          '<div class="muted">' + t.members.map(function (m) { return esc(m.name); }).join(' · ') + '</div></div>';
      }).join('') + '</div>';
    document.body.appendChild(fs);
    fs.querySelector('#closeFs').addEventListener('click', function () { fs.remove(); });
  }

  /* ---------- 투표·결과 ---------- */

  function viewVote() {
    var st = A.st;
    var pct = st.studentCount ? Math.round(st.voteCount / st.studentCount * 100) : 0;
    var maxCoins = Math.max.apply(null, [1].concat(st.results.map(function (r) { return r.coins; })));
    return '<div class="card"><div class="card-title"><h2>투표·결과 공개</h2></div>' +
      FLAG_INFO.slice(4).map(function (f) {
        return '<div class="flag-row">' + sw(f[0], st.flags[f[1]]) + '<div class="grow"><b>' + esc(f[2]) + '</b><div class="small muted">' + esc(f[3]) + '</div></div></div>';
      }).join('') + '</div>' +

      '<div class="card"><div class="card-title"><h2>투표 진행</h2><div class="grow"></div><b>' + st.voteCount + ' / ' + st.studentCount + '명</b></div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="small" style="margin-top:12px">' + st.dashboard.map(function (t) {
        var left = t.members.filter(function (m) { return !m.voted; });
        return '<div style="padding:4px 0"><b>' + esc(t.name) + '</b> ' + (left.length ? '<span class="muted">미투표: ' + left.map(function (m) { return esc(m.no + ' ' + m.name); }).join(', ') + '</span>' : '<span class="chip ok">모두 완료</span>') + '</div>';
      }).join('') + '</div></div>' +

      '<div class="card"><div class="card-title"><h2>집계</h2><div class="grow"></div>' +
      '<button class="btn gold" id="btnShow">🏆 발표 모드</button></div>' +
      (st.results.length ? '<div class="bars">' + st.results.map(function (r) {
        return '<div class="bar-row"><div class="rk ' + (r.rank === 1 ? 'top' : '') + '">' + r.rank + '</div>' +
          '<div class="bar" style="--c:' + esc(r.color) + '"><i style="width:' + Math.round(r.coins / maxCoins * 100) + '%"></i>' +
          '<span><span>' + esc(r.icon) + ' ' + esc(r.city) + ' <span class="muted small">' + esc(r.name) + ' · ' + esc(r.climate) + '</span></span>' +
          '<span>🪙 ' + r.coins + ' <span class="muted small">(' + r.investors + '명)</span></span></span></div></div>' +
          (r.reasons.length ? '<div></div><div class="reasons" style="margin:-4px 0 6px">' + r.reasons.slice(0, 6).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' : '');
      }).join('') + '</div>' : '<p class="muted">기후를 뽑은 팀이 없어요.</p>') +
      '</div>';
  }

  function bindVote(view) {
    bindFlags(view);
    $('#btnShow', view).addEventListener('click', showResults);
  }

  /** 발표 모드: 꼴찌부터 한 팀씩 공개 */
  function showResults() {
    var list = A.st.results.slice();
    if (!list.length) { toast('집계할 팀이 없어요.', 'error'); return; }
    var order = list.slice().reverse();
    var shown = 0;
    var fs = document.createElement('div');
    fs.className = 'fullscreen';
    document.body.appendChild(fs);
    function draw() {
      var revealed = order.slice(0, shown);
      var done = shown >= order.length;
      var top = done ? list.filter(function (r) { return r.rank === 1; }) : [];
      var maxCoins = Math.max.apply(null, [1].concat(list.map(function (r) { return r.coins; })));
      fs.innerHTML = '<div class="row between" style="margin-bottom:16px"><div><div class="section-label">2050 CLIMATE CITY EXPO</div>' +
        '<h1 style="font-size:clamp(1.6rem,4vw,2.6rem)">투자 결과 발표</h1></div>' +
        '<div class="row"><button class="btn lg gold" id="nextBtn" ' + (done ? 'disabled' : '') + '>' + (shown === order.length - 1 ? '🏆 우승 도시 공개' : '다음 ▶') + '</button>' +
        '<button class="btn lg" id="closeFs">닫기 ✕</button></div></div>' +
        (top.length ? '<div class="winner" style="--c:' + esc(top[0].color) + ';margin-bottom:20px"><div class="crown">👑</div><div class="section-label">WINNER</div>' +
          top.map(function (r) { return '<h2>' + esc(r.icon) + ' ' + esc(r.city) + '</h2><p class="muted">' + esc(r.name) + ' · ' + esc(r.climate) + ' 기후 · 🪙 ' + r.coins + '</p>' + (r.intro ? '<p>' + esc(r.intro) + '</p>' : ''); }).join('') + '</div>' : '') +
        '<div class="bars">' + list.map(function (r) {
          var vis = revealed.indexOf(r) >= 0;
          return '<div class="bar-row"><div class="rk ' + (r.rank === 1 ? 'top' : '') + '">' + (vis ? r.rank : '?') + '</div>' +
            '<div class="bar" style="--c:' + esc(vis ? r.color : '#334') + ';min-height:64px"><i style="width:' + (vis ? Math.round(r.coins / maxCoins * 100) : 0) + '%"></i>' +
            '<span style="font-size:1.25rem;padding:16px 18px">' + (vis ? '<span>' + esc(r.icon) + ' ' + esc(r.city) + ' <span class="muted small">' + esc(r.name) + '</span></span><span>🪙 ' + r.coins + '</span>' : '<span class="muted">???</span><span></span>') + '</span></div></div>';
        }).join('') + '</div>';
      fs.querySelector('#closeFs').addEventListener('click', close);
      var nb = fs.querySelector('#nextBtn');
      if (nb) nb.addEventListener('click', next);
      if (done) E.confetti(top.map(function (r) { return r.color; }).concat(['#f7c54d', '#ffffff']));
    }
    // 뒤에서부터 공개하되, 마지막(우승)은 한 번에
    function next() { shown = Math.min(order.length, shown + 1); draw(); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if ((e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') && shown < order.length) { e.preventDefault(); next(); }
    }
    function close() { document.removeEventListener('keydown', onKey); fs.remove(); }
    document.addEventListener('keydown', onKey);
    draw();
  }

  /* ---------- 포인트·월드 ---------- */

  var POINT_KEYS = ['POINT_STAGE1', 'POINT_STAGE2', 'POINT_DISASTER', 'POINT_STAGE4', 'POINT_VOTE', 'POINT_WIN_1', 'POINT_WIN_2', 'POINT_WIN_3', 'COINS_PER_STUDENT', 'PROJECT_ID'];

  function viewPoints() {
    var st = A.st;
    var rows = st.settingsRows.filter(function (r) { return POINT_KEYS.indexOf(r.key) >= 0; });
    var byStudent = {};
    st.exported.forEach(function (p) {
      var k = String(p.no);
      if (!byStudent[k]) byStudent[k] = { no: p.no, name: p.name, team: p.team, items: [], total: 0 };
      byStudent[k].items.push(p.item + ' ' + p.points);
      byStudent[k].total += Number(p.points) || 0;
    });
    var list = Object.keys(byStudent).map(function (k) { return byStudent[k]; }).sort(function (a, b) { return Number(a.no) - Number(b.no); });
    var sum = list.reduce(function (a, b) { return a + b.total; }, 0);
    var winner = st.results[0];
    return '<div class="card"><div class="card-title"><h2>🏅 포인트 기준</h2></div>' +
      '<p class="small muted">값을 고치면 바로 Settings 탭에 저장돼요.</p>' +
      '<div class="table-wrap"><table class="tbl"><tbody>' + rows.map(function (r) {
        return '<tr><td><code>' + esc(r.key) + '</code></td><td style="width:140px"><input type="text" data-setkey="' + esc(r.key) + '" value="' + esc(r.value) + '"></td><td class="small muted">' + esc(r.note) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-title"><h2>포인트 내보내기</h2><div class="grow"></div>' +
      '<button class="btn primary" id="btnExport">계산해서 Export_Points에 기록</button></div>' +
      '<p class="small muted">누를 때마다 Export_Points 탭을 새로 계산해 덮어써요. 지급ID(프로젝트ID-번호-항목)가 같으면 같은 지급이라 그로스포인트에서 중복을 막을 수 있어요.</p>' +
      (list.length ? '<p class="small">학생 ' + list.length + '명 / 합계 ' + sum + '점</p><div class="table-wrap"><table class="tbl"><thead><tr><th>번호</th><th>이름</th><th>팀</th><th>항목</th><th>합계</th></tr></thead><tbody>' +
        list.map(function (s) {
          return '<tr><td>' + esc(s.no) + '</td><td>' + esc(s.name) + '</td><td>' + esc(s.team) + '</td><td class="small muted">' + esc(s.items.join(' · ')) + '</td><td><b>' + s.total + '</b></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">아직 내보낸 기록이 없어요.</p>') +
      '</div>' +

      '<div class="card"><div class="card-title"><h2>🌍 우승 도시 등록 (World_Buildings)</h2></div>' +
      '<p class="small muted">나중에 3D 월드에 건물로 지을 도시를 기록해요. 같은 팀·같은 도시 이름은 한 줄로 갱신돼요.</p>' +
      (st.results.length ? '<div class="row"><select id="worldTeam" style="width:auto;min-width:220px">' + teamOpts(winner && winner.id, st.results.map(function (r) {
        return { id: r.id, name: r.rank + '위 ' + r.name, city: r.city };
      })) + '</select><button class="btn gold" id="btnWorld">월드에 등록</button></div>' : '<p class="muted">기후를 뽑은 팀이 없어요.</p>') +
      (st.world.length ? '<div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>팀ID</th><th>도시 이름</th><th>기후</th><th>한 줄 소개</th><th>포스터</th><th>득표</th><th>등록일</th></tr></thead><tbody>' +
        st.world.map(function (w) {
          return '<tr><td>' + esc(w.team) + '</td><td><b>' + esc(w.city) + '</b></td><td>' + esc(w.climate) + '</td><td class="small">' + esc(w.intro) + '</td><td>' +
            (w.poster ? '<a href="' + esc(w.poster) + '" target="_blank" rel="noopener">열기</a>' : '') + '</td><td>' + esc(w.votes) + '</td><td class="small">' + esc(w.regAt) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      '</div>';
  }

  function bindSettingInputs(view) {
    $all('[data-setkey]', view).forEach(function (el) {
      el.addEventListener('change', async function () {
        try {
          A.st = await call('adminSetSetting', el.dataset.setkey, el.value);
          toast('저장했어요: ' + el.dataset.setkey, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  function bindPoints(view) {
    bindSettingInputs(view);
    $('#btnExport', view).addEventListener('click', function (e) { act(e.currentTarget, 'adminExportPoints').catch(function () {}); });
    var bw = $('#btnWorld', view);
    if (bw) bw.addEventListener('click', function (e) { act(e.currentTarget, 'adminRegisterWorld', $('#worldTeam').value).catch(function () {}); });
  }

  /* ---------- 카드 편집 ---------- */

  function viewCards() {
    var st = A.st;
    var climateNames = st.climates.map(function (c) { return c.name; }).concat(['공통']);
    return '<div class="card flat"><p class="small muted" style="margin:0">여기서 고치면 Climates·Disasters 탭에 저장돼요. 새 카드를 추가하려면 <a href="' + esc(st.sheetUrl) + '" target="_blank" rel="noopener">스프레드시트</a>에서 행을 추가하세요(재난ID는 겹치지 않게).</p></div>' +
      '<h2 style="margin:18px 0 10px">🃏 기후 카드</h2><div class="team-grid">' +
      st.climates.map(function (c) {
        return '<div class="card flat" data-card="Climates" data-id="' + esc(c.name) + '">' +
          '<div class="row between"><span class="climate-badge" style="--c:' + esc(c.color) + '">' + esc(c.icon) + ' ' + esc(c.name) + '</span>' +
          '<label class="row small"><input type="checkbox" data-k="active" ' + (c.active ? 'checked' : '') + '> 사용</label></div>' +
          field('특징', 'desc', c.desc, 2) + field('전통 생활 힌트', 'life', c.life, 3) + field('대표 지역', 'region', c.region, 2) +
          '<div class="two">' + field('아이콘', 'icon', c.icon, 0) + field('색상', 'color', c.color, 0) + '</div>' +
          '<button class="btn sm primary" data-save>저장</button></div>';
      }).join('') + '</div>' +
      '<h2 style="margin:24px 0 10px">🌪️ 재난 카드</h2><div class="team-grid">' +
      st.disasters.map(function (d) {
        return '<div class="card flat" data-card="Disasters" data-id="' + esc(d.id) + '">' +
          '<div class="row between"><span class="chip">' + esc(d.id) + '</span>' +
          '<label class="row small"><input type="checkbox" data-k="active" ' + (d.active ? 'checked' : '') + '> 사용</label></div>' +
          '<div class="field"><label class="lbl small">기후</label><select data-k="climate">' + climateNames.map(function (n) {
            return '<option ' + (n === d.climate ? 'selected' : '') + '>' + esc(n) + '</option>';
          }).join('') + '</select></div>' +
          field('재난 이름', 'name', d.name, 0) + field('상황', 'story', d.story, 3) + field('생각해 볼 질문', 'question', d.question, 2) +
          '<button class="btn sm primary" data-save>저장</button></div>';
      }).join('') + '</div>';
  }

  function field(label, key, value, rows) {
    return '<div class="field"><label class="lbl small">' + esc(label) + '</label>' +
      (rows ? '<textarea data-k="' + key + '" rows="' + rows + '" style="min-height:0">' + esc(value) + '</textarea>'
        : '<input type="text" data-k="' + key + '" value="' + esc(value) + '">') + '</div>';
  }

  function bindCards(view) {
    $all('[data-save]', view).forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('[data-card]');
        var obj = {};
        $all('[data-k]', card).forEach(function (el) { obj[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
        act(b, 'adminSaveCard', card.dataset.card, card.dataset.id, obj).then(function () { toast('카드를 저장했어요.', 'ok'); }).catch(function () {});
      });
    });
  }

  /* ---------- 설정·초기화 ---------- */

  var HIDDEN_KEYS = ['STAGE1_OPEN', 'STAGE2_OPEN', 'STAGE3_OPEN', 'STAGE4_OPEN', 'VOTING_OPEN', 'RESULTS_PUBLIC'];

  function viewSettings() {
    var st = A.st;
    var rows = st.settingsRows.filter(function (r) { return HIDDEN_KEYS.indexOf(r.key) < 0 && POINT_KEYS.indexOf(r.key) < 0; });
    return '<div class="card"><div class="card-title"><h2>⚙️ 설정</h2></div>' +
      '<p class="small muted">값을 고치고 칸 밖을 누르면 저장돼요. 단계 스위치는 [단계·재난], 포인트는 [포인트·월드] 탭에 있어요.</p>' +
      '<div class="table-wrap"><table class="tbl"><tbody>' + rows.map(function (r) {
        var long = r.key === 'AI_RULES';
        return '<tr><td><code>' + esc(r.key) + '</code><div class="tiny muted">' + esc(r.note) + '</div></td><td style="min-width:260px">' +
          (long ? '<textarea data-setkey="' + esc(r.key) + '" rows="6">' + esc(r.value) + '</textarea>'
            : '<input type="' + (r.key === 'ADMIN_PIN' ? 'password' : 'text') + '" data-setkey="' + esc(r.key) + '" value="' + esc(r.value) + '">') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-title"><h2>🔗 연결 정보</h2></div>' +
      '<dl class="kv"><dt>스프레드시트</dt><dd><a href="' + esc(st.sheetUrl) + '" target="_blank" rel="noopener">열기</a></dd>' +
      '<dt>서버 주소</dt><dd class="small" style="word-break:break-all">' + esc(E.apiUrl()) + '</dd>' +
      '<dt>학생 주소</dt><dd class="small" style="word-break:break-all">' + esc(location.href.replace(/admin\.html.*$/, 'index.html')) + '</dd></dl>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="btnSchema">시트 구조 점검</button></div></div>' +

      '<div class="card" style="border-color:rgba(255,107,107,.5)"><div class="card-title"><h2>⚠️ 전체 초기화</h2></div>' +
      '<p class="small">기후·직책·설계·재난·포스터·투표·포인트 기록을 지우고 1단계부터 다시 시작해요. 기후·재난 카드 내용과 World_Buildings 기록은 남아요.</p>' +
      '<label class="row small" style="margin-bottom:10px"><input type="checkbox" id="resetRoster"> 명단(Teams·Students)도 지우기</label>' +
      '<button class="btn danger solid" id="btnReset">전체 초기화</button></div>';
  }

  function bindSettings(view) {
    bindSettingInputs(view);
    $('#btnSchema', view).addEventListener('click', function (e) { act(e.currentTarget, 'adminCheckSchema').catch(function () {}); });
    $('#btnReset', view).addEventListener('click', async function (e) {
      var btn = e.currentTarget;
      var withRoster = $('#resetRoster').checked;
      var ok1 = await E.confirmBox('정말 초기화할까요? (1/2)', '<p>학생들이 쓴 내용이 모두 지워져요. 되돌릴 수 없어요.</p>' +
        (withRoster ? '<p class="chip bad">명단도 함께 지워져요.</p>' : ''), '다음', 'danger solid');
      if (!ok1) return;
      var word = await E.modal({
        title: '마지막 확인 (2/2)',
        html: '<p>아래 칸에 <b>초기화</b> 라고 입력하세요.</p><input type="text" id="resetWord" autocomplete="off">',
        buttons: [{ label: '취소', value: null, cls: 'ghost' }, {
          label: '초기화 실행', cls: 'danger solid', value: 'go',
          before: function (bg) { bg._word = bg.querySelector('#resetWord').value.trim(); A._word = bg._word; }
        }]
      });
      if (word !== 'go') return;
      if (A._word !== '초기화') { toast('입력한 문구가 달라서 취소했어요.', 'error'); return; }
      act(btn, 'adminResetAll', A._word, withRoster).catch(function () {});
    });
  }

  var VIEWS = { dash: viewDash, stages: viewStages, roster: viewRoster, vote: viewVote, points: viewPoints, cards: viewCards, settings: viewSettings };
  var BIND = {
    dash: function (view) {
      $all('[data-detail]', view).forEach(function (b) { b.addEventListener('click', function () { showDetail(b.dataset.detail); }); });
    },
    stages: bindStages, roster: bindRoster, vote: bindVote, points: bindPoints, cards: bindCards, settings: bindSettings
  };

  /* ---------- 시작 ---------- */
  if (A.token) {
    refresh().then(function () { if (A.st) startTimer(); else renderLogin(); });
  } else {
    renderLogin();
  }
})();
