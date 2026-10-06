/* 2050 기후 도시 엑스포 — 학생 화면 */
(function () {
  'use strict';
  var E = window.Expo;
  var esc = E.esc, escBr = E.escBr, $ = E.$, $all = E.$all, toast = E.toast;

  var S = {
    session: E.store('expo_session'),
    st: null,
    view: 'board',
    sub4: 'poster',
    fields: {},
    timer: null,
    polling: false,
    animating: false,
    sig: ''
  };

  var STAGES = [
    { n: 1, icon: '🃏', name: '뽑는다', desc: '기후 카드를 뽑고 팀원 직책을 정해요.' },
    { n: 2, icon: '🏗️', name: '짓는다', desc: '직책별로 "이 기후라서 이렇게 지었다"를 기록해요.' },
    { n: 3, icon: '🌪️', name: '버틴다', desc: '재난 카드가 오면 대응 방법과 고친 설계를 적어요.' },
    { n: 4, icon: '🏆', name: '자랑한다', desc: 'Canva 포스터로 엑스포에 참가하고 다른 도시에 투자해요.' }
  ];

  var PLACEHOLDER = {
    city_name: '예: ○○ 기후의 미래 도시 이름',
    intro: '우리 도시를 한 문장으로 소개해요',
    housing_what: '어떤 집과 건물을 지었나요? 모양, 재료, 배치를 적어요.',
    energy_what: '전기, 냉방·난방, 물은 어떻게 얻고 쓰나요?',
    food_what: '먹을거리는 어떻게 기르고, 나누고, 저장하나요?',
    transport_what: '사람과 물건은 어떻게 이동하나요? 위험에서 어떻게 지키나요?',
    why: '우리 기후는 ______ 이기 때문에 ______ 하게 만들었다.',
    tradition_keep: '이 기후 지역 사람들이 옛날부터 해 온 생활 중 하나 (아래 힌트 참고)',
    tradition_future: '그 방법을 2050년식으로 어떻게 바꿨나요?',
    ai_question: 'Gemini에게 실제로 한 질문을 그대로 적어요.',
    ai_fix: 'AI 답에서 틀렸거나 우리 기후와 안 맞아서 우리가 고친 점',
    survive: '재난이 왔을 때 우리 도시의 어떤 설계가, 어떻게 도시를 지키나요?',
    fix: '재난을 겪고 나서 설계에서 무엇을 고치거나 더했나요? (직책 이름도 적어요)'
  };

  /* ---------- 서버 ---------- */

  async function sapi(fn) {
    var args = [fn, S.session.code, S.session.no].concat(Array.prototype.slice.call(arguments, 1));
    try {
      return await E.api.apply(null, args);
    } catch (e) {
      if (/팀 코드를 다시 확인|명단에서 이름을 찾을 수 없어요/.test(e.message)) {
        toast(e.message, 'error');
        forceLogout();
      }
      throw e;
    }
  }

  function forceLogout() {
    S.session = null;
    S.st = null;
    S.voteDraft = null;
    E.store('expo_session', null);
    clearInterval(S.timer);
    renderLogin();
  }

  function startPolling() {
    clearInterval(S.timer);
    S.timer = setInterval(function () { if (!document.hidden) poll(); }, 20000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.st) poll(); });

  async function poll() {
    if (S.polling || S.animating || !S.session) return;
    S.polling = true;
    try { applyState(await sapi('state'), true); } catch (e) { /* 다음에 다시 */ }
    finally { S.polling = false; }
  }

  function applyState(st, soft) {
    S.st = st;
    renderChrome();
    var v = VIEWS[S.view];
    var sig = v.sig ? v.sig() : '';
    if (soft && v.patch && sig === S.sig) { v.patch($('#view')); return; }
    if (soft && anyDirty()) { if (v.patch) v.patch($('#view')); return; }
    if (soft && S.animating) return;
    var y = window.scrollY;
    renderView();
    if (soft) window.scrollTo(0, y);
  }

  /* ---------- 도우미 ---------- */

  function stage(n) { return S.st.stages[n - 1]; }
  function role(id) { return S.st.roles.filter(function (r) { return r.id === id; })[0]; }
  function holderOf(roleId) { return S.st.team.members.filter(function (m) { return m.role === roleId; })[0]; }
  function isMe(m) { return m && String(m.no) === String(S.st.me.no); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function climateBadge(c) {
    if (!c) return '<span class="chip">기후 미정</span>';
    return '<span class="climate-badge" style="--c:' + esc(c.color) + '">' + esc(c.icon) + ' ' + esc(c.name) + '</span>';
  }
  function lockedPanel(icon, title, msg) {
    return '<div class="card locked-panel"><div class="big">' + icon + '</div><h2>' + esc(title) + '</h2><p class="muted">' + msg + '</p></div>';
  }
  function go(view) {
    S.view = view;
    renderChrome();
    renderView();
    window.scrollTo(0, 0);
  }

  /* ---------- 로그인 ---------- */

  function renderLogin() {
    $('#app').innerHTML =
      '<div class="login"><div class="panel"><div class="card">' +
      '<div class="section-label">WORLD CITY LEAGUE · 2050</div>' +
      '<div class="hero-title"><span>2050 기후 도시</span><br>엑스포</div>' +
      '<p class="muted" style="margin-top:10px">세계도시연맹의 의뢰를 받은 도시설계 회사 여러분, 환영합니다.</p>' +
      (E.apiUrl() ? '' : '<p class="chip bad">서버 주소가 설정되지 않았어요. 선생님께 알려 주세요.</p>') +
      '<form id="codeForm" class="stack" style="margin-top:16px">' +
      '<label class="lbl" for="teamCode">팀 코드</label>' +
      '<input id="teamCode" class="code-input" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="____">' +
      '<button class="btn primary lg block" type="submit">입장하기</button></form>' +
      '<div id="memberBox" style="margin-top:18px"></div>' +
      '</div></div></div>';
    $('#codeForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var code = $('#teamCode').value.trim().toUpperCase();
      var btn = ev.target.querySelector('button');
      try {
        var r = await E.busy(btn, function () { return E.api('lookupTeam', code); });
        $('#memberBox').innerHTML = '<h3>' + esc(r.team.name) + ' — 나는 누구인가요?</h3>' +
          '<div class="member-grid">' + r.members.map(function (m) {
            return '<button class="btn member-btn" data-no="' + esc(m.no) + '"><span class="muted small">' + esc(m.no) + '번</span><b>' + esc(m.name) + '</b></button>';
          }).join('') + '</div>';
        $all('[data-no]').forEach(function (b) {
          b.addEventListener('click', async function () {
            try {
              var st = await E.busy(b, function () { return E.api('login', code, b.dataset.no); });
              S.session = { code: code, no: b.dataset.no };
              E.store('expo_session', S.session);
              S.view = 'board';
              S.st = st;
              renderApp();
              startPolling();
            } catch (e) { /* busy가 알림 */ }
          });
        });
      } catch (e) { $('#memberBox').innerHTML = ''; }
    });
  }

  /* ---------- 틀 ---------- */

  function renderApp() {
    $('#app').innerHTML =
      '<header class="topbar"><div class="wrap">' +
      '<div class="brand"><div class="logo">2050</div><div>기후 도시 엑스포<small id="clsName"></small></div></div>' +
      '<div class="who" id="who"></div></div>' +
      '<nav class="tabs" id="tabs"></nav></header>' +
      '<main class="wrap" id="view"></main>';
    $('#tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]');
      if (b) go(b.dataset.view);
    });
    $('#who').addEventListener('click', async function (e) {
      if (!e.target.closest('#btnLogout')) return;
      if (anyDirty()) { toast('저장 중인 글이 있어요. 잠시 후 다시 눌러 주세요.', 'error'); return; }
      var ok = await E.confirmBox('나가기', '<p>다른 친구가 이 기기로 들어오려면 나가기를 누르세요.</p>', '나가기');
      if (ok) forceLogout();
    });
    renderChrome();
    renderView();
  }

  function renderChrome() {
    var st = S.st;
    $('#clsName').textContent = st.settings.className || '';
    var myRole = role(st.me.role);
    $('#who').innerHTML = climateBadge(st.climateInfo) +
      '<span><b>' + esc(st.team.name) + '</b> <span class="name-full">' + esc(st.me.name) + (myRole ? ' · ' + myRole.icon : '') + '</span></span>' +
      '<button class="btn sm ghost" id="btnLogout">나가기</button>';
    var tabs = [['mission', '📜 미션'], ['board', '🧭 진행판']];
    STAGES.forEach(function (s) {
      var stg = stage(s.n);
      tabs.push(['s' + s.n, s.n + ' ' + s.name + (stg.done ? ' ✓' : (stg.open ? '' : ' <span class="lock">🔒</span>')),
        s.n === 3 && stg.open && !stg.done ? 'alert' : '']);
    });
    if (st.results) tabs.push(['results', '🏆 결과']);
    $('#tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab ' + (S.view === t[0] ? 'active ' : '') + (t[2] || '') + '" data-view="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
  }

  function renderView() {
    var v = VIEWS[S.view] || VIEWS.board;
    S.fields = {};
    var el = $('#view');
    el.innerHTML = v.render();
    S.sig = v.sig ? v.sig() : '';
    if (v.bind) v.bind(el);
  }

  /* ---------- 미션 소개 ---------- */

  var VIEWS = {};

  VIEWS.mission = {
    render: function () {
      var st = S.st;
      return '<div class="letter">' +
        '<div class="stamp">긴급 의뢰</div>' +
        '<h2>미래 도시 설계 의뢰서</h2>' +
        '<div class="meta"><b>수신</b><span>' + esc(st.team.name) + ' 도시설계 회사</span>' +
        '<b>발신</b><span>세계도시연맹 미래도시위원회</span><b>일시</b><span>2050년</span></div>' +
        '<p>세계 곳곳의 도시는 저마다 다른 기후 속에서 살아가고 있습니다. 세계도시연맹은 여러분의 회사에 <b>한 가지 기후에 꼭 맞는 2050년 미래 도시</b>의 설계를 맡기려 합니다.</p>' +
        '<p>화려한 기술보다 중요한 것은 단 하나, <span class="key">"이 기후라서 이렇게 지었다"</span>는 이유입니다. 그 기후에서 오래 살아온 사람들의 지혜를 이어받고, 미래식으로 바꾸어 주십시오.</p>' +
        '<p>설계가 끝나면 갑작스러운 재난이 도시를 시험할 것입니다. 끝까지 버틴 도시는 엑스포에서 전 세계 투자자에게 소개됩니다.</p>' +
        '<p style="text-align:right;margin:0"><b>세계도시연맹 미래도시위원회</b></p></div>' +

        '<h2 style="margin:22px 0 10px">프로젝트 4단계</h2><div class="steps">' + STAGES.map(function (s) {
          return '<div class="step" data-go="s' + s.n + '"><div class="num">STEP ' + s.n + '</div><div class="ico">' + s.icon + '</div><h3>' + s.name + '</h3><p class="small muted">' + s.desc + '</p></div>';
        }).join('') + '</div>' +

        '<div class="card" style="margin-top:18px"><div class="card-title"><h2>👥 직책 4가지</h2></div><div class="roles">' +
        st.roles.map(function (r) { return '<div class="role"><div class="ico">' + r.icon + '</div><b>' + esc(r.name) + '</b><span class="small muted">' + esc(r.hint) + '</span></div>'; }).join('') +
        '</div></div>' +

        '<div class="card"><div class="card-title"><h2>🤖 AI 사용 규칙</h2></div>' +
        (st.settings.aiRules.length ? '<ol class="rules">' + st.settings.aiRules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>' : '<p class="muted">선생님이 정한 규칙을 따르세요.</p>') +
        '</div>' +

        '<div class="card"><div class="card-title"><h2>🪙 투자자들이 보는 것</h2></div>' +
        '<p>엑스포에서 친구들은 코인 ' + st.settings.coins + '개를 다른 팀 도시에 나눠 투자합니다. 가장 많이 받는 도시는 <b>기후와의 연결이 가장 잘 보이는 도시</b>일 거예요.</p></div>';
    },
    bind: function (el) {
      $all('[data-go]', el).forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.go); }); });
    }
  };

  /* ---------- 진행판 ---------- */

  function todoList() {
    var st = S.st, out = [];
    var me = st.me;
    if (stage(1).open) {
      if (!st.team.climate) out.push(['s1', '팀 대표가 기후 카드를 뽑아요.']);
      if (!me.role) out.push(['s1', '내 직책을 골라요.']);
    }
    if (stage(2).open && st.team.climate) {
      var mine = st.designFields.filter(function (f) { return f.role && f.role === me.role && !String(st.design[f.key]).trim(); });
      if (mine.length) out.push(['s2', '내 직책 칸 ' + mine.length + '개를 채워요.']);
      var common = st.designFields.filter(function (f) { return !f.role && !String(st.design[f.key]).trim(); });
      if (common.length) out.push(['s2', '팀 공통 칸 ' + common.length + '개가 비어 있어요.']);
    }
    if (stage(3).open) {
      if (!st.disaster) out.push(['s3', '재난 카드를 뽑아요!']);
      else if (!stage(3).done) out.push(['s3', '재난 대응을 적어요.']);
    }
    if (stage(4).open) {
      if (!st.team.poster) out.push(['s4', 'Canva 포스터 링크를 제출해요.']);
      if (st.vote.open && !st.vote.done) out.push(['s4', '다른 도시에 투자해요.']);
    }
    return out;
  }

  VIEWS.board = {
    render: function () {
      var st = S.st;
      var current = 0;
      st.stages.forEach(function (s) { if (s.open && !s.done && !current) current = s.n; });
      var todos = todoList();
      return '<div class="card"><div class="row between">' +
        '<div><div class="section-label">' + esc(st.team.name) + ' 진행판</div>' +
        '<h2 style="margin:0">' + (st.design.city_name ? '🏙️ ' + esc(st.design.city_name) : '아직 이름 없는 도시') + '</h2>' +
        (st.design.intro ? '<p class="muted" style="margin:4px 0 0">' + esc(st.design.intro) + '</p>' : '') + '</div>' +
        climateBadge(st.climateInfo) + '</div></div>' +

        '<div class="steps" style="margin-top:14px">' + STAGES.map(function (s) {
          var stg = stage(s.n);
          var cls = stg.done ? 'done' : (!stg.open ? 'locked' : (current === s.n ? 'current' : ''));
          var status = stg.done ? '<span class="chip ok">완료 ✓</span>' : (!stg.open ? '<span class="chip">🔒 잠김</span>' : '<span class="chip accent">진행 중</span>');
          var miss = stg.open && !stg.done ? stg.missing.slice(0, 4) : [];
          return '<div class="step ' + cls + '" data-go="s' + s.n + '"><span class="status">' + status + '</span>' +
            '<div class="num">STEP ' + s.n + '</div><div class="ico">' + (stg.open || stg.done ? s.icon : '🔒') + '</div><h3>' + s.name + '</h3>' +
            (miss.length ? '<ul>' + miss.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + (stg.missing.length > 4 ? '<li>외 ' + (stg.missing.length - 4) + '개</li>' : '') + '</ul>'
              : '<p class="small muted">' + s.desc + '</p>') +
            '</div>';
        }).join('') + '</div>' +

        '<div class="two" style="margin-top:14px">' +
        '<div class="card flat" style="margin:0"><div class="card-title"><h3>✅ 지금 할 일</h3></div>' +
        (todos.length ? todos.map(function (t) {
          return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(t[1]) + '</span><button class="btn sm" data-go="' + t[0] + '">가기 ▶</button></div>';
        }).join('') : '<p class="muted">지금은 할 일이 없어요. 선생님 안내를 기다려요.</p>') + '</div>' +
        '<div class="card flat" style="margin:0"><div class="card-title"><h3>👥 우리 팀</h3></div>' +
        st.team.members.map(function (m) {
          var r = role(m.role);
          return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(m.no) + '. <b>' + esc(m.name) + '</b>' + (isMe(m) ? ' <span class="chip accent">나</span>' : '') + '</span>' +
            '<span class="muted small">' + (r ? r.icon + ' ' + esc(r.name) : '직책 미정') + '</span></div>';
        }).join('') + '</div></div>';
    },
    bind: function (el) {
      $all('[data-go]', el).forEach(function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation(); go(b.dataset.go); });
      });
    }
  };

  /* ---------- 1단계: 기후 뽑기 + 직책 ---------- */

  function climateFront(c, label) {
    return '<div class="ico">' + esc(c.icon) + '</div><div class="nm">' + esc(c.name) + '</div>' +
      '<div class="small" style="opacity:.85;margin-top:4px">' + esc(c.desc) + '</div>' +
      (label ? '<div class="card-tag">' + esc(label) + '</div>' : '');
  }

  function climateInfoCard(c) {
    return '<div class="card"><div class="climate-info">' +
      '<div class="flip big flipped mine"><div class="inner"><div class="face back"><div class="q">?</div></div>' +
      '<div class="face front" style="--c:' + esc(c.color) + '">' + climateFront(c, '우리 기후') + '</div></div></div>' +
      '<div><div class="section-label">OUR CLIMATE</div><h2>' + esc(c.icon) + ' ' + esc(c.name) + ' 기후</h2>' +
      '<dl class="kv"><dt>특징</dt><dd>' + esc(c.desc) + '</dd>' +
      (c.life ? '<dt>전통 생활 힌트</dt><dd>' + esc(c.life) + '</dd>' : '') +
      (c.region ? '<dt>대표 지역</dt><dd>' + esc(c.region) + '</dd>' : '') + '</dl>' +
      '<div class="question">💡 설계할 때마다 떠올리기: <b>"이 기후의 ______ 때문에 ______ 하게 짓는다."</b></div></div>' +
      '</div></div>';
  }

  VIEWS.s1 = {
    sig: function () { return [stage(1).open, S.st.team.climate].join('|'); },
    render: function () {
      var st = S.st, open = stage(1).open;
      if (!open && !st.team.climate) return lockedPanel('🔒', '1단계가 아직 잠겨 있어요', '선생님이 열면 기후 카드를 뽑을 수 있어요.');
      var html = '';
      if (st.climateInfo) {
        html += climateInfoCard(st.climateInfo);
      } else {
        var taken = st.climates.filter(function (c) { return c.takenBy; });
        var left = st.climates.filter(function (c) { return !c.takenBy; });
        html += '<div class="card"><div class="card-title"><h2>🃏 기후 카드 뽑기</h2></div>' +
          '<p class="muted">팀 대표 한 명이 뒤집힌 카드 하나를 눌러요. 이미 다른 팀이 뽑은 기후는 나오지 않아요.</p>' +
          '<div class="deck" id="deck">' +
          taken.map(function (c) {
            return '<div class="flip flipped taken"><div class="inner"><div class="face back"></div>' +
              '<div class="face front" style="--c:' + esc(c.color) + '">' + climateFront(c, c.takenBy) + '</div></div></div>';
          }).join('') +
          left.map(function () {
            return '<div class="flip pickable" data-pick><div class="inner"><div class="face back"><div class="q">?</div><div class="t">CLIMATE CARD</div></div>' +
              '<div class="face front"></div></div></div>';
          }).join('') +
          '</div>' + (left.length ? '' : '<p class="chip bad" style="margin-top:12px">남은 기후 카드가 없어요. 선생님께 알려 주세요.</p>') + '</div>';
      }
      html += rolesCard(open);
      return html;
    },
    patch: function (el) {
      var box = $('#rolesBox', el);
      if (box) box.outerHTML = rolesCard(stage(1).open);
      bindRoles(el);
    },
    bind: function (el) {
      $all('[data-pick]', el).forEach(function (card) {
        card.addEventListener('click', function () { drawClimate(card); });
      });
      bindRoles(el);
    }
  };

  async function drawClimate(card) {
    if (S.animating) return;
    var ok = await E.confirmBox('기후 카드를 뽑을까요?', '<p><b>팀 대표 한 명만</b> 눌러 주세요. 한 번 뽑으면 바꿀 수 없어요.</p>', '뽑기!', 'gold');
    if (!ok) return;
    S.animating = true;
    card.classList.add('shake');
    try {
      var st = await sapi('drawClimate');
      var c = st.climateInfo;
      var front = card.querySelector('.front');
      front.style.setProperty('--c', c.color);
      front.innerHTML = climateFront(c, '우리 기후!');
      card.classList.remove('shake');
      card.classList.add('flipped', 'mine');
      await wait(1500);
      S.animating = false;
      applyState(st);
      toast(c.icon + ' ' + c.name + ' 기후를 뽑았어요!', 'ok');
    } catch (e) {
      S.animating = false;
      card.classList.remove('shake');
      toast(e.message, 'error');
      poll();
    }
  }

  function rolesCard(open) {
    var st = S.st;
    var filled = st.team.members.filter(function (m) { return m.role; }).length;
    return '<div class="card" id="rolesBox"><div class="card-title"><h2>👥 직책 정하기</h2><div class="grow"></div>' +
      '<span class="chip ' + (stage(1).done ? 'ok' : '') + '">' + filled + ' / ' + st.team.members.length + '명</span></div>' +
      '<p class="small muted">한 사람이 직책 하나. 팀 안에서 겹칠 수 없어요.' + (open ? '' : ' (1단계가 잠겨서 지금은 바꿀 수 없어요)') + '</p>' +
      '<div class="roles">' + st.roles.map(function (r) {
        var h = holderOf(r.id);
        var mine = isMe(h);
        var btn = '';
        if (open) {
          if (mine) btn = '<button class="btn sm ghost" data-role="">내려놓기</button>';
          else if (!h) btn = '<button class="btn sm primary" data-role="' + r.id + '">' + (st.me.role ? '이 직책으로 바꾸기' : '내가 맡기') + '</button>';
          else btn = '<button class="btn sm" disabled>맡음</button>';
        }
        return '<div class="role ' + (mine ? 'mine' : (h ? 'taken' : '')) + '"><div class="ico">' + r.icon + '</div>' +
          '<b>' + esc(r.name) + '</b><span class="small muted">' + esc(r.hint) + '</span>' +
          '<span class="holder ' + (h ? '' : 'empty') + '">' + (h ? esc(h.name) + (mine ? ' (나)' : '') : '비어 있음') + '</span>' + btn + '</div>';
      }).join('') + '</div></div>';
  }

  function bindRoles(el) {
    $all('[data-role]', el).forEach(function (b) {
      b.addEventListener('click', async function () {
        try {
          var st = await E.busy(b, function () { return sapi('chooseRole', b.dataset.role); });
          applyState(st);
          toast(b.dataset.role ? role(b.dataset.role).name + ' 직책을 맡았어요.' : '직책을 내려놓았어요.', 'ok');
        } catch (e) { poll(); }
      });
    });
  }

  /* ---------- 자동 저장 칸 ---------- */

  function fieldHtml(key, label, value, o) {
    o = o || {};
    var max = o.max || 600;
    var id = 'f-' + key;
    var ph = esc(o.placeholder || '');
    var input = o.input
      ? '<input type="text" id="' + id + '" maxlength="' + max + '" placeholder="' + ph + '" value="' + esc(value) + '"' + (o.readonly ? ' readonly' : '') + '>'
      : '<textarea id="' + id + '" rows="' + (o.rows || 3) + '" maxlength="' + max + '" placeholder="' + ph + '"' + (o.readonly ? ' readonly' : '') + '>' + esc(value) + '</textarea>';
    return '<div class="field" data-field="' + key + '" data-kind="' + (o.kind || '') + '">' +
      '<label class="lbl" for="' + id + '">' + esc(label) + '</label>' + input +
      '<div class="field-foot"><span class="save-state">' + (o.readonly ? esc(o.owner || '') : '') + '</span>' +
      '<span class="why-hint" data-hint></span><span data-count>' + String(value || '').length + '/' + max + '</span></div></div>';
  }

  /** 칸 등록: 입력 1.5초 멈추면 / 칸을 벗어나면 저장 */
  function regField(el, key, base, fn, onSaved) {
    var box = el.closest('.field');
    var F = { key: key, el: el, box: box, base: String(base || ''), fn: fn, timer: null, saving: false, again: false, onSaved: onSaved,
      kind: box.dataset.kind, max: Number(el.getAttribute('maxlength')) || 600 };
    S.fields[key] = F;
    el.addEventListener('input', function () {
      clearTimeout(F.timer);
      label(F, '입력 중…', '');
      foot(F);
      F.timer = setTimeout(function () { saveField(F); }, 1500);
    });
    el.addEventListener('blur', function () { clearTimeout(F.timer); saveField(F); });
    $('.save-state', box).addEventListener('click', function () { if (this.classList.contains('error')) saveField(F); });
    foot(F);
    return F;
  }

  function label(F, text, cls) {
    var s = $('.save-state', F.box);
    s.textContent = text;
    s.className = 'save-state ' + (cls || '');
  }

  function foot(F) {
    var v = F.el.value;
    $('[data-count]', F.box).textContent = v.length + '/' + F.max;
    var hint = $('[data-hint]', F.box);
    if (F.kind === 'why' || F.key === 'survive') {
      var ok = E.mentionsClimate(v, S.st.team.climate);
      hint.className = 'why-hint' + (ok ? ' good' : '');
      hint.textContent = !v.trim() ? '' : (ok ? '✓ 기후 특징이 들어갔어요' : '💡 기온·비·바람 같은 기후 특징을 넣어 보세요');
    }
  }

  async function saveField(F) {
    if (F.saving) { F.again = true; return; }
    var value = F.el.value;
    if (value === F.base) return;
    F.saving = true;
    label(F, '저장 중…', 'saving');
    try {
      var r = await sapi(F.fn, F.key, value, F.base);
      if (r.conflict) {
        F.saving = false;
        await resolveConflict(F, r, value);
        return;
      }
      F.base = value;
      label(F, '저장됨 ✓', 'saved');
      if (F.onSaved) F.onSaved(F.key, value);
    } catch (e) {
      label(F, '저장 실패 — 눌러서 다시 시도', 'error');
      toast(e.message, 'error');
      if (e.network) { clearTimeout(F.timer); F.timer = setTimeout(function () { saveField(F); }, 6000); }
    } finally {
      F.saving = false;
      if (F.again) { F.again = false; if (F.el.value !== F.base) saveField(F); }
    }
  }

  async function resolveConflict(F, r, mine) {
    var choice = await E.modal({
      title: '친구가 먼저 고쳤어요',
      html: '<p class="small muted">같은 칸을 ' + esc(r.by || '팀원') + ' 친구가 방금 바꿨어요. 어떻게 할까요?</p>' +
        '<div class="field"><label class="lbl small">친구가 쓴 내용</label><div class="card flat" style="padding:10px">' + (r.current ? escBr(r.current) : '<span class="muted">(빈칸)</span>') + '</div></div>' +
        '<div class="field"><label class="lbl small">내가 쓴 내용</label><div class="card flat" style="padding:10px">' + (mine ? escBr(mine) : '<span class="muted">(빈칸)</span>') + '</div></div>',
      dismissable: false,
      buttons: [
        { label: '친구 것 쓰기', value: 'theirs', cls: 'ghost' },
        { label: '둘 다 합치기', value: 'merge' },
        { label: '내 것으로 저장', value: 'mine', cls: 'primary' }
      ]
    });
    F.base = r.current;
    if (choice === 'theirs') {
      F.el.value = r.current;
      label(F, '친구 내용으로 바꿨어요', 'saved');
      if (F.onSaved) F.onSaved(F.key, r.current);
    } else {
      var sep = F.el.tagName === 'INPUT' ? ' ' : '\n';
      F.el.value = choice === 'merge' ? (r.current ? r.current + sep : '') + mine : mine;
      saveField(F);
    }
    foot(F);
  }

  function anyDirty() {
    return Object.keys(S.fields).some(function (k) {
      var F = S.fields[k];
      return F.saving || F.el.value !== F.base;
    });
  }

  /** 새로 받은 값으로 칸 갱신(내가 고치는 중인 칸은 건드리지 않음) */
  function patchFields(values) {
    Object.keys(S.fields).forEach(function (k) {
      var F = S.fields[k];
      var sv = String(values[k] === undefined ? '' : values[k]);
      if (F.saving || document.activeElement === F.el || F.el.value !== F.base || sv === F.base) return;
      F.el.value = sv;
      F.base = sv;
      foot(F);
      F.box.classList.remove('flash');
      void F.box.offsetWidth;
      F.box.classList.add('flash');
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (anyDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- 2단계: 설계 기록 ---------- */

  function designProgress() {
    var st = S.st;
    var done = st.designFields.filter(function (f) { return String(st.design[f.key] || '').trim(); }).length;
    return { done: done, total: st.designFields.length };
  }

  function progressHtml() {
    var p = designProgress();
    return '<div class="row" style="margin-top:10px"><div class="progress grow"><i style="width:' + Math.round(p.done / p.total * 100) + '%"></i></div>' +
      '<b class="small">' + p.done + ' / ' + p.total + '칸</b></div>';
  }

  VIEWS.s2 = {
    sig: function () {
      return [stage(2).open, S.st.team.climate, S.st.me.role, S.st.team.members.map(function (m) { return m.role; }).join(',')].join('|');
    },
    render: function () {
      var st = S.st, c = st.climateInfo;
      if (!stage(2).open) return lockedPanel('🔒', '2단계는 선생님이 열면 시작해요', '그동안 1단계에서 우리 기후 카드를 다시 읽어 보세요.');
      if (!c) return lockedPanel('🃏', '먼저 기후 카드를 뽑아요', '1단계에서 팀 대표가 기후 카드를 뽑으면 설계를 시작할 수 있어요.');
      var f = function (key) { return st.designFields.filter(function (x) { return x.key === key; })[0]; };
      var order = st.roles.slice().sort(function (a, b) { return (b.id === st.me.role) - (a.id === st.me.role); });
      return '<div class="card"><div class="design-head">' + climateBadge(c) +
        '<div class="grow"><b>우리 기후: ' + esc(c.desc) + '</b><div class="small muted">모든 "이유" 칸에 이 기후의 특징(기온·비·바람·계절 등)이 들어가야 해요.</div></div></div>' +
        '<div id="progBox">' + progressHtml() + '</div>' +
        '<p class="tiny muted" style="margin:8px 0 0">글은 쓰는 도중에 자동으로 저장돼요. 내 직책 칸은 나만, 팀 공통 칸은 누구나 고칠 수 있어요.</p></div>' +

        '<div class="card"><div class="card-title"><h2>🏙️ 도시 소개</h2><span class="chip">팀 공통</span></div><div class="two">' +
        fieldHtml('city_name', '도시 이름', st.design.city_name, { input: true, max: f('city_name').max, placeholder: PLACEHOLDER.city_name }) +
        fieldHtml('intro', '한 줄 소개', st.design.intro, { input: true, max: f('intro').max, placeholder: PLACEHOLDER.intro }) +
        '</div></div>' +

        order.map(function (r) {
          var h = holderOf(r.id);
          var mine = isMe(h);
          var ro = !!h && !mine;
          var owner = h ? '✏️ ' + h.name + ' 담당' : '';
          return '<div class="card role-card ' + (mine ? 'mine' : '') + '"><div class="card-title"><span style="font-size:1.6rem">' + r.icon + '</span>' +
            '<div><h3 style="margin:0">' + esc(r.name) + '</h3><div class="tiny muted">' + esc(r.hint) + '</div></div>' +
            '<span class="owner chip ' + (mine ? 'accent' : '') + '">' + (h ? esc(h.name) + (mine ? ' (나)' : '') : '담당 없음 · 누구나') + '</span></div>' +
            '<div class="two">' +
            fieldHtml(r.id + '_what', '무엇을 만들었나', st.design[r.id + '_what'], { readonly: ro, owner: owner, placeholder: PLACEHOLDER[r.id + '_what'] }) +
            fieldHtml(r.id + '_why', '이 기후라서 이렇게 한 이유', st.design[r.id + '_why'], { readonly: ro, owner: owner, kind: 'why', placeholder: PLACEHOLDER.why }) +
            '</div></div>';
        }).join('') +

        '<div class="card"><div class="card-title"><h2>🏺 전통 생활 계승</h2><span class="chip">팀 공통</span></div>' +
        (c.life ? '<div class="question small" style="margin:0 0 12px">힌트 · ' + esc(c.name) + ' 기후의 전통 생활: ' + esc(c.life) + '</div>' : '') +
        '<div class="two">' +
        fieldHtml('tradition_keep', '전통 생활에서 계승한 것 1개', st.design.tradition_keep, { placeholder: PLACEHOLDER.tradition_keep }) +
        fieldHtml('tradition_future', '미래식으로 바꾼 방법', st.design.tradition_future, { placeholder: PLACEHOLDER.tradition_future }) +
        '</div></div>' +

        '<div class="card"><div class="card-title"><h2>🤖 AI 사용 기록</h2><span class="chip">팀 공통</span></div>' +
        '<p class="small muted">AI 답을 그대로 옮기지 말고, 우리가 확인하고 고친 점을 적어요.</p><div class="two">' +
        fieldHtml('ai_question', 'AI에게 한 질문 1개', st.design.ai_question, { placeholder: PLACEHOLDER.ai_question }) +
        fieldHtml('ai_fix', '우리가 고친 것 1개', st.design.ai_fix, { placeholder: PLACEHOLDER.ai_fix }) +
        '</div></div>';
    },
    bind: function (el) {
      $all('[data-field]', el).forEach(function (box) {
        var input = box.querySelector('textarea, input');
        if (input.readOnly) return;
        regField(input, box.dataset.field, S.st.design[box.dataset.field], 'saveDesign', function (k, v) {
          S.st.design[k] = v;
          $('#progBox').innerHTML = progressHtml();
        });
      });
    },
    patch: function (el) {
      patchFields(S.st.design);
      $all('[data-field]', el).forEach(function (box) {
        var input = box.querySelector('textarea, input');
        if (input.readOnly) input.value = S.st.design[box.dataset.field] || '';
      });
      var pb = $('#progBox', el);
      if (pb) pb.innerHTML = progressHtml();
    }
  };

  /* ---------- 3단계: 재난 ---------- */

  function revealKey() { return 'expo_rev_' + S.st.team.id + '_' + (S.st.disaster ? S.st.disaster.id : ''); }
  function revealed() { return !!E.store(revealKey()); }

  function disasterFront(d) {
    return '<div class="ico" style="font-size:2.4rem">🌪️</div><div class="nm">' + esc(d.name) + '</div>' +
      '<div class="card-tag">' + (d.wild ? '공통 와일드카드' : esc(d.climate) + ' 재난') + '</div>';
  }

  function disasterDeck(label, attr) {
    return '<div class="card center"><div class="section-label" style="color:var(--danger)">DISASTER ALERT</div>' +
      '<h2>🚨 재난 경보가 울렸습니다!</h2><p class="muted">우리 기후의 재난 카드 또는 공통 와일드카드 중 한 장이 나와요.</p>' +
      '<div class="deck" style="grid-template-columns:minmax(0,220px);margin:16px 0">' +
      '<div class="flip pickable" id="disCard"><div class="inner"><div class="face back disaster-back"><div class="q">⚠ 재난</div></div>' +
      '<div class="face front disaster-front"></div></div></div></div>' +
      '<button class="btn danger solid lg" ' + attr + '>' + label + '</button></div>';
  }

  function designSummary() {
    var st = S.st;
    return '<details class="card flat"><summary style="cursor:pointer;font-weight:800">📐 우리 설계 다시 보기</summary>' +
      st.roles.map(function (r) {
        return '<div class="detail-section"><h4>' + r.icon + ' ' + esc(r.name) + '</h4>' +
          '<p>' + (st.design[r.id + '_what'] ? escBr(st.design[r.id + '_what']) : '<span class="muted">(비어 있음)</span>') + '</p>' +
          (st.design[r.id + '_why'] ? '<p class="why small">이유: ' + escBr(st.design[r.id + '_why']) + '</p>' : '') + '</div>';
      }).join('') +
      '<p style="margin-top:12px"><button class="btn sm" data-go="s2">2단계에서 설계 고치기 ▶</button></p></details>';
  }

  VIEWS.s3 = {
    sig: function () { return [stage(3).open, S.st.disaster ? S.st.disaster.id : '', S.st.disaster ? revealed() : ''].join('|'); },
    render: function () {
      var st = S.st;
      if (!stage(3).open) {
        return '<div class="siren"><div class="bell">🚨</div><h2 style="margin-top:12px">곧 재난이 옵니다</h2>' +
          '<p class="muted">세계도시연맹 관측소가 이상 신호를 감지했습니다.<br>경보가 울리면 재난 카드가 열립니다.</p>' +
          '<div class="card flat" style="max-width:480px;margin:18px auto 0;text-align:left"><b>그 전에 점검하기</b>' +
          '<ul class="small" style="margin:8px 0 0;padding-left:18px">' +
          '<li>모든 "이유" 칸에 기후 특징(기온·비·바람·계절)이 들어갔나요?</li>' +
          '<li>우리 기후에서 일어날 수 있는 재난을 하나 떠올려 보세요.</li>' +
          '<li>그 재난이 오면 우리 도시의 어느 설계가 버텨 줄까요?</li></ul></div></div>';
      }
      if (!st.team.climate) return lockedPanel('🃏', '먼저 기후 카드를 뽑아요', '1단계에서 기후를 뽑아야 재난 카드를 받을 수 있어요.');
      if (!st.disaster) return disasterDeck('재난 카드 뽑기', 'id="btnDrawDis"');
      if (!revealed()) return disasterDeck('카드 뒤집기', 'id="btnReveal"');
      var d = st.disaster;
      return '<div class="card disaster-card"><div class="tag">' + (d.wild ? '⚡ 공통 와일드카드' : '🌪️ ' + esc(d.climate) + ' 기후 재난') + '</div>' +
        '<h2 style="font-size:1.6rem;margin:6px 0">' + esc(d.name) + '</h2>' +
        '<p>' + escBr(d.story) + '</p>' +
        (d.question ? '<div class="question">🤔 ' + esc(d.question) + '</div>' : '') + '</div>' +
        '<div class="card"><div class="card-title"><h2>🛡️ 우리 도시의 대응</h2><span class="chip">팀 공통</span></div>' +
        fieldHtml('survive', '우리 도시는 어떻게 버티나', st.response.survive, { rows: 4, placeholder: PLACEHOLDER.survive }) +
        fieldHtml('fix', '설계에서 고친 점', st.response.fix, { rows: 4, placeholder: PLACEHOLDER.fix }) +
        '<p class="tiny muted">설계를 실제로 고쳤다면 2단계 칸 내용도 함께 바꿔 주세요.</p></div>' +
        designSummary();
    },
    bind: function (el) {
      var draw = $('#btnDrawDis', el);
      if (draw) draw.addEventListener('click', drawDisaster);
      var rev = $('#btnReveal', el);
      if (rev) rev.addEventListener('click', function () { flipDisaster(S.st.disaster); });
      $all('[data-go]', el).forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.go); }); });
      $all('[data-field]', el).forEach(function (box) {
        var input = box.querySelector('textarea, input');
        regField(input, box.dataset.field, S.st.response[box.dataset.field], 'saveResponse', function (k, v) { S.st.response[k] = v; });
      });
    },
    patch: function () { patchFields(S.st.response); }
  };

  async function flipDisaster(d) {
    var card = $('#disCard');
    S.animating = true;
    var front = card.querySelector('.front');
    front.innerHTML = disasterFront(d);
    card.classList.add('flipped');
    $all('#view button').forEach(function (b) { b.disabled = true; });
    await wait(1700);
    E.store(revealKey(), 1);
    S.animating = false;
    renderView();
  }

  async function drawDisaster(e) {
    var btn = e.currentTarget;
    var ok = await E.confirmBox('재난 카드를 뽑을까요?', '<p>팀에서 한 명만 눌러 주세요. 한 번 뽑으면 바꿀 수 없어요.</p>', '뽑기', 'danger solid');
    if (!ok) return;
    var card = $('#disCard');
    card.classList.add('shake');
    try {
      var st = await E.busy(btn, function () { return sapi('drawDisaster'); });
      card.classList.remove('shake');
      S.st = st;
      renderChrome();
      await flipDisaster(st.disaster);
    } catch (err) {
      card.classList.remove('shake');
      poll();
    }
  }

  /* ---------- 4단계: 포스터 · 엑스포 · 투자 ---------- */

  function draftKey() { return 'expo_vote_' + S.st.team.id + '_' + S.st.me.no; }
  function getDraft() {
    if (!S.voteDraft) S.voteDraft = E.store(draftKey()) || { alloc: {}, reasons: {} };
    return S.voteDraft;
  }
  function saveDraft() { E.store(draftKey(), S.voteDraft); }
  function otherTeams() { return (S.st.expo || []).filter(function (t) { return !t.mine; }); }

  VIEWS.s4 = {
    sig: function () {
      var st = S.st;
      return [stage(4).open, S.sub4, st.vote.open, st.vote.done, st.team.poster].join('|') + (S.sub4 === 'expo' ? JSON.stringify(st.expo) : '');
    },
    render: function () {
      var st = S.st;
      if (!stage(4).open) return lockedPanel('🔒', '4단계는 선생님이 열면 시작해요', 'Canva로 포스터를 만들 준비를 해 두세요.');
      var tabs = [['poster', '🎨 포스터 제출' + (st.team.poster ? ' ✓' : '')], ['expo', '🏛️ 엑스포 관람'],
        ['vote', '🪙 투자 투표' + (st.vote.done ? ' ✓' : (st.vote.open ? '' : ' 🔒'))]];
      return '<div class="seg" id="seg4" style="margin-bottom:14px">' + tabs.map(function (t) {
        return '<button class="' + (S.sub4 === t[0] ? 'on' : '') + '" data-sub="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="sub4">' + SUB4[S.sub4]() + '</div>';
    },
    bind: function (el) {
      $all('[data-sub]', el).forEach(function (b) {
        b.addEventListener('click', function () { S.sub4 = b.dataset.sub; renderView(); });
      });
      SUB4BIND[S.sub4](el);
    },
    patch: function () { /* 투표 고르는 중에는 화면을 다시 그리지 않음 */ }
  };

  var SUB4 = {
    poster: function () {
      var st = S.st;
      return '<div class="card"><div class="card-title"><h2>🎨 Canva 포스터 제출</h2><span class="chip">팀당 1개</span></div>' +
        '<ol class="rules">' +
        '<li>Canva에서 우리 도시 포스터를 완성해요. <span class="muted small">도시 이름, 기후, 직책별 설계와 "이 기후라서" 이유, 재난 대응이 들어가면 좋아요.</span></li>' +
        '<li>Canva 오른쪽 위 <b>[공유]</b>를 눌러 접근 권한을 <b>"링크가 있는 모든 사용자"(보기 가능)</b>로 바꿔요.</li>' +
        '<li>링크를 복사해서 아래에 붙여넣고 [제출]을 눌러요. 다시 제출하면 새 링크로 바뀌어요.</li></ol>' +
        (st.team.poster ? '<div class="question" style="margin:12px 0">✅ 제출된 포스터: <a href="' + esc(st.team.poster) + '" target="_blank" rel="noopener">새 창에서 열기</a>' +
          ' <span class="small muted">(친구 기기에서도 열리는지 확인해요)</span></div>' : '') +
        '<form id="posterForm" class="row" style="margin-top:12px"><input type="url" id="posterUrl" class="grow" style="flex:1 1 260px" placeholder="https://www.canva.com/design/..." value="' + esc(st.team.poster) + '">' +
        '<button class="btn primary" type="submit">' + (st.team.poster ? '바꾸기' : '제출') + '</button></form></div>';
    },
    expo: function () {
      var list = S.st.expo || [];
      if (!list.length) return '<div class="card"><p class="muted">아직 참가한 도시가 없어요.</p></div>';
      return '<p class="muted small" style="margin:0 0 10px">도시 카드를 누르면 자세한 설계를 볼 수 있어요. 투자할 도시를 미리 골라 두세요.</p>' +
        '<div class="city-grid">' + list.map(function (t) {
          var whyCount = t.roles.filter(function (r) { return String(r.why || '').trim(); }).length;
          return '<div class="city" data-city="' + esc(t.id) + '" style="--c:' + esc(t.color) + '"><div class="band"></div><div class="body">' +
            (t.mine ? '<span class="chip accent mine-tag">우리 팀</span>' : '') +
            '<div class="row"><span class="climate-badge" style="--c:' + esc(t.color) + '">' + esc(t.icon) + ' ' + esc(t.climate) + '</span><span class="small muted">' + esc(t.name) + '</span></div>' +
            '<h3>' + esc(t.city || t.name + '의 도시') + '</h3>' +
            '<p class="small muted" style="margin:0">' + esc(t.intro || '소개 준비 중') + '</p>' +
            '<div class="row small" style="margin-top:auto;padding-top:6px">' +
            '<span class="chip">📐 이유 ' + whyCount + '/4</span>' +
            (t.disaster ? '<span class="chip bad">🌪️ ' + esc(t.disaster.name) + '</span>' : '') +
            (t.poster ? '<span class="chip ok">🎨 포스터</span>' : '<span class="chip">포스터 준비 중</span>') + '</div>' +
            '</div></div>';
        }).join('') + '</div>';
    },
    vote: function () {
      var st = S.st;
      if (!st.vote.open && !st.vote.done) {
        return lockedPanel('🪙', '투자 투표는 선생님이 열면 시작돼요', '그동안 엑스포에서 도시들을 살펴보고, 기후와 가장 잘 연결된 도시를 골라 두세요.');
      }
      if (st.vote.done) {
        var names = {};
        (st.expo || []).forEach(function (t) { names[t.id] = t; });
        return '<div class="card center"><div style="font-size:3rem">🪙</div><h2>투자 완료!</h2><p class="muted">투자는 한 번만 할 수 있어요. 결과 발표를 기다려요.</p>' +
          '<div style="max-width:420px;margin:0 auto;text-align:left">' + st.vote.mine.map(function (v) {
            var t = names[v.target] || { name: v.target, city: '' };
            return '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>' + esc(t.icon || '') + ' ' + esc(t.city || t.name) + '</span><b style="color:var(--gold)">🪙 ' + v.coins + '</b></div>';
          }).join('') + '</div></div>';
      }
      var d = getDraft();
      var coins = st.settings.coins;
      var others = otherTeams();
      var used = others.reduce(function (a, t) { return a + (d.alloc[t.id] || 0); }, 0);
      var left = coins - used;
      return '<div class="card"><div class="card-title"><h2>🪙 투자 투표</h2></div>' +
        '<p class="small muted">코인 ' + coins + '개를 다른 팀 도시에 나눠 투자해요. 우리 팀에는 투자할 수 없고, <b>제출하면 바꿀 수 없어요.</b> 기준: 기후와 설계가 얼마나 잘 연결되었나?</p>' +
        '<div class="row between" style="margin:10px 0"><b>남은 코인 <span id="leftNum" style="color:var(--gold)">' + left + '</span>개</b></div>' +
        '<div class="coins-bank" id="bank">' + coinBank(left, coins) + '</div>' +
        '<div style="margin-top:8px">' + others.map(function (t) {
          var n = d.alloc[t.id] || 0;
          return '<div class="invest-row" data-team="' + esc(t.id) + '"><div><div class="row"><span class="climate-badge" style="--c:' + esc(t.color) + '">' + esc(t.icon) + ' ' + esc(t.climate) + '</span>' +
            '<b>' + esc(t.city || t.name) + '</b></div><div class="small muted">' + esc(t.name) + (t.intro ? ' · ' + esc(t.intro) : '') + '</div>' +
            '<input type="text" class="reason" maxlength="120" placeholder="투자 이유 (선택): 어떤 점이 기후와 잘 연결됐나요?" value="' + esc(d.reasons[t.id] || '') + '" style="margin-top:8px;' + (n ? '' : 'display:none') + '"></div>' +
            '<div class="stepper"><button type="button" data-step="-1" aria-label="빼기">−</button><span class="val">' + n + '</span><button type="button" data-step="1" aria-label="더하기">+</button></div></div>';
        }).join('') + '</div>' +
        '<button class="btn gold lg block" id="btnVote" style="margin-top:16px" ' + (left === 0 ? '' : 'disabled') + '>' + (left === 0 ? '투자 제출하기' : '코인을 모두 나눠 주세요 (' + left + '개 남음)') + '</button></div>';
    }
  };

  function coinBank(left, total) {
    var html = '';
    for (var i = 0; i < total; i++) html += i < left ? '<span class="coin">₵</span>' : '<span class="coin empty"></span>';
    return html;
  }

  var SUB4BIND = {
    poster: function (el) {
      $('#posterForm', el).addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var url = $('#posterUrl').value.trim();
        if (!/^https:\/\//.test(url)) { toast('https:// 로 시작하는 링크를 붙여넣어 주세요.', 'error'); return; }
        if (!/canva\.(com|link)/.test(url)) {
          var ok = await E.confirmBox('Canva 링크가 아닌 것 같아요', '<p>' + esc(url) + '</p><p>그래도 제출할까요?</p>', '제출');
          if (!ok) return;
        }
        try {
          var st = await E.busy(ev.target.querySelector('button'), function () { return sapi('submitPoster', url); });
          applyState(st);
          toast('포스터 링크를 제출했어요!', 'ok');
        } catch (e) { /* 알림됨 */ }
      });
    },
    expo: function (el) {
      $all('[data-city]', el).forEach(function (c) {
        c.addEventListener('click', function () { cityDetail(c.dataset.city); });
      });
    },
    vote: function (el) {
      var btn = $('#btnVote', el);
      if (!btn) return;
      var d = getDraft();
      var coins = S.st.settings.coins;
      function update() {
        var used = otherTeams().reduce(function (a, t) { return a + (d.alloc[t.id] || 0); }, 0);
        var left = coins - used;
        $('#leftNum').textContent = left;
        $('#bank').innerHTML = coinBank(left, coins);
        $all('.invest-row', el).forEach(function (row) {
          var n = d.alloc[row.dataset.team] || 0;
          $('.val', row).textContent = n;
          $('[data-step="-1"]', row).disabled = n <= 0;
          $('[data-step="1"]', row).disabled = left <= 0;
          $('.reason', row).style.display = n ? '' : 'none';
        });
        btn.disabled = left !== 0;
        btn.textContent = left === 0 ? '투자 제출하기' : '코인을 모두 나눠 주세요 (' + left + '개 남음)';
        saveDraft();
      }
      $all('[data-step]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.closest('.invest-row').dataset.team;
          d.alloc[id] = Math.max(0, (d.alloc[id] || 0) + Number(b.dataset.step));
          update();
        });
      });
      $all('.reason', el).forEach(function (inp) {
        inp.addEventListener('input', function () { d.reasons[inp.closest('.invest-row').dataset.team] = inp.value; saveDraft(); });
      });
      btn.addEventListener('click', async function () {
        var others = otherTeams().filter(function (t) { return d.alloc[t.id]; });
        var ok = await E.confirmBox('이대로 투자할까요?', '<p class="small muted">제출하면 바꿀 수 없어요.</p>' + others.map(function (t) {
          return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(t.icon) + ' ' + esc(t.city || t.name) + '</span><b style="color:var(--gold)">🪙 ' + d.alloc[t.id] + '</b></div>';
        }).join(''), '투자 확정', 'gold');
        if (!ok) return;
        var alloc = {}, reasons = {};
        others.forEach(function (t) { alloc[t.id] = d.alloc[t.id]; reasons[t.id] = (d.reasons[t.id] || '').trim(); });
        try {
          var st = await E.busy(btn, function () { return sapi('submitVote', alloc, reasons); });
          E.store(draftKey(), null);
          S.voteDraft = null;
          applyState(st);
          E.confetti(['#f7c54d', '#ffe9a6', '#ffffff']);
          toast('투자를 마쳤어요!', 'ok');
        } catch (e) { poll(); }
      });
      update();
    }
  };

  function cityDetail(id) {
    var t = (S.st.expo || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var empty = '<span class="muted">(아직 비어 있음)</span>';
    var roles = S.st.roles;
    var html = '<div class="row"><span class="climate-badge" style="--c:' + esc(t.color) + '">' + esc(t.icon) + ' ' + esc(t.climate) + '</span><span class="muted">' + esc(t.name) + '</span></div>' +
      (t.intro ? '<p style="margin-top:8px">' + esc(t.intro) + '</p>' : '') +
      t.roles.map(function (r) {
        var info = roles.filter(function (x) { return x.id === r.role; })[0];
        return '<div class="detail-section"><h4>' + info.icon + ' ' + esc(info.name) + (r.holder ? ' <span class="muted small">· ' + esc(r.holder) + '</span>' : '') + '</h4>' +
          '<p>' + (r.what ? escBr(r.what) : empty) + '</p>' +
          '<p class="why">💡 이 기후라서: ' + (r.why ? escBr(r.why) : empty) + '</p></div>';
      }).join('') +
      '<div class="detail-section"><h4>🏺 전통 생활 계승</h4><p>' + (t.tradition.keep ? escBr(t.tradition.keep) : empty) + '</p>' +
      (t.tradition.future ? '<p class="small">→ 미래식으로: ' + escBr(t.tradition.future) + '</p>' : '') + '</div>' +
      '<div class="detail-section"><h4>🌪️ 재난: ' + esc(t.disaster ? t.disaster.name : '없음') + '</h4>' +
      '<p>' + (t.response.survive ? escBr(t.response.survive) : empty) + '</p>' +
      (t.response.fix ? '<p class="small">🔧 고친 점: ' + escBr(t.response.fix) + '</p>' : '') + '</div>';
    var buttons = [{ label: '닫기', value: null, cls: 'ghost' }];
    if (t.poster) buttons.push({ label: '🎨 포스터 보기', value: 'poster', cls: 'primary' });
    E.modal({ title: t.city || t.name, html: html, wide: true, buttons: buttons }).then(function (v) {
      if (v === 'poster') window.open(t.poster, '_blank', 'noopener');
    });
  }

  /* ---------- 결과 발표 ---------- */

  VIEWS.results = {
    render: function () {
      var list = S.st.results;
      if (!list) return lockedPanel('🏆', '결과 발표 전이에요', '선생님이 결과를 공개하면 여기에서 볼 수 있어요.');
      var top = list.filter(function (r) { return r.rank === 1 && r.coins > 0; });
      var maxCoins = Math.max.apply(null, [1].concat(list.map(function (r) { return r.coins; })));
      var mine = list.filter(function (r) { return r.id === S.st.team.id; })[0];
      return (top.length ? top.map(function (r) {
        return '<div class="winner" style="--c:' + esc(r.color) + ';margin-bottom:14px"><div class="crown">👑</div><div class="section-label" style="color:var(--gold)">2050 EXPO WINNER</div>' +
          '<h2>' + esc(r.icon) + ' ' + esc(r.city) + '</h2><p class="muted">' + esc(r.name) + ' · ' + esc(r.climate) + ' 기후 · 🪙 ' + r.coins + '개 · 투자자 ' + r.investors + '명</p>' +
          (r.intro ? '<p>' + esc(r.intro) + '</p>' : '') +
          (r.reasons.length ? '<div class="reasons" style="justify-content:center;margin-top:10px">' + r.reasons.slice(0, 6).map(function (x) { return '<span>“' + esc(x) + '”</span>'; }).join('') + '</div>' : '') +
          (r.poster ? '<p style="margin-top:12px"><a class="btn gold" href="' + esc(r.poster) + '" target="_blank" rel="noopener">🎨 우승 포스터 보기</a></p>' : '') + '</div>';
      }).join('') : '') +
      (mine ? '<div class="card flat center" style="margin-bottom:14px"><b>' + esc(S.st.team.name) + '</b>은(는) <b style="color:var(--gold)">' + mine.rank + '위</b> · 🪙 ' + mine.coins + '개를 받았어요.</div>' : '') +
      '<div class="card"><div class="card-title"><h2>📊 투자 순위</h2></div><div class="bars">' + list.map(function (r) {
        return '<div class="bar-row"><div class="rk ' + (r.rank === 1 ? 'top' : '') + '">' + r.rank + '</div>' +
          '<div class="bar" style="--c:' + esc(r.color) + '"><i style="width:' + Math.round(r.coins / maxCoins * 100) + '%"></i>' +
          '<span><span>' + esc(r.icon) + ' ' + esc(r.city) + ' <span class="muted small">' + esc(r.name) + '</span></span><span>🪙 ' + r.coins + '</span></span></div></div>';
      }).join('') + '</div></div>';
    },
    bind: function () {
      var key = 'expo_confetti_' + S.st.team.id;
      if (S.st.results && !E.store(key)) {
        E.store(key, 1);
        var top = S.st.results.filter(function (r) { return r.rank === 1; });
        E.confetti(top.map(function (r) { return r.color; }).concat(['#f7c54d', '#ffffff']));
      }
    }
  };

  /* ---------- 시작 ---------- */

  async function boot() {
    if (!S.session) { renderLogin(); return; }
    try {
      S.st = await sapi('state');
      renderApp();
      startPolling();
    } catch (e) {
      if (!S.session) return; // forceLogout 됨
      $('#app').innerHTML = '<div class="login"><div class="panel card center"><h2>연결하지 못했어요</h2><p class="muted">' + esc(e.message) + '</p>' +
        '<div class="row" style="justify-content:center"><button class="btn primary" id="retry">다시 시도</button><button class="btn ghost" id="relog">처음으로</button></div></div></div>';
      $('#retry').addEventListener('click', boot);
      $('#relog').addEventListener('click', forceLogout);
    }
  }
  boot();
})();
