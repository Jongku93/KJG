/* 직책 가이드 화면 만들기 (학생 앱 모달, 교사용 guide.html 공용) — 데이터는 guide-data.js */
(function () {
  'use strict';
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function list(items, cls) {
    return '<ul class="' + (cls || '') + '">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  /**
   * key: housing|energy|food|transport|basic|tradition|ai
   * opts: { climate: '열대', life: '기후 카드 전통 생활 힌트', checks: true }
   */
  function html(key, opts) {
    opts = opts || {};
    var G = window.EXPO_GUIDE;
    var g = G.roles[key] || G.common[key];
    if (!g) return '';
    var isRole = !!G.roles[key];
    var out = '<div class="guide"><p class="guide-mission">🎯 ' + esc(g.mission) + '</p>';
    if (isRole) {
      out += '<h4>🧭 할 일 3단계</h4><ol class="guide-steps">' + G.steps.map(function (s) {
        return '<li><b>' + esc(s.t) + '</b> ' + esc(s.d) + '</li>';
      }).join('') + '</ol>';
      if (opts.climate && g.climate[opts.climate]) {
        out += '<h4>🌍 ' + esc(opts.climate) + ' 기후라면? 꼭 생각해 볼 질문</h4>' + list(g.climate[opts.climate], 'guide-q');
      }
      out += '<h4>💭 더 생각해 보기</h4>' + list(g.think);
      out += '<h4>🔗 다른 직책과 연결</h4><p>' + esc(g.links) + '</p>';
    } else {
      if (key === 'tradition' && opts.life) out += '<div class="question small">힌트 · ' + esc(opts.climate || '') + ' 기후의 전통 생활: ' + esc(opts.life) + '</div>';
      out += '<h4>💭 생각해 보기</h4>' + list(g.think);
    }
    out += '<h4>✍️ 문장 비교</h4>' +
      '<div class="ex good"><b>👍 좋은 예' + (g.exClimate ? ' <span class="tiny">(' + esc(g.exClimate) + ' 기후 예시 — 우리 기후로 바꿔 생각해요)</span>' : '') + '</b><div>' + esc(g.good) + '</div></div>' +
      '<div class="ex weak"><b>🤔 아쉬운 예</b><div>' + esc(g.weak) + '</div><div class="tiny">왜? ' + esc(g.weakWhy) + '</div></div>';
    if (isRole && opts.checks !== false) out += '<h4>✅ 다 쓰고 스스로 점검</h4>' + list(G.checks, 'checklist');
    return out + '</div>';
  }

  function title(key, roles) {
    var G = window.EXPO_GUIDE;
    if (G.common[key]) return G.common[key].title + ' 가이드';
    var r = (roles || []).filter(function (x) { return x.id === key; })[0];
    return (r ? r.icon + ' ' + r.name : key) + ' 가이드';
  }

  window.ExpoGuide = { html: html, title: title };
})();
