/* 2050 기후 도시 엑스포 — 공통 스크립트 (서버 호출, 화면 도우미) */
(function () {
  'use strict';

  /** API 주소: ?api= (시험용, 이 탭에서만) > config.js */
  function apiUrl() {
    try {
      var q = new URLSearchParams(location.search).get('api');
      if (q) sessionStorage.setItem('expo_api', q);
      var s = sessionStorage.getItem('expo_api');
      if (s) return s;
    } catch (e) { /* 저장소 차단 */ }
    return (window.EXPO_CONFIG && window.EXPO_CONFIG.API_URL) || '';
  }

  /** 서버 함수 호출. 실패하면 한국어 메시지를 담은 Error */
  async function api(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    var url = apiUrl();
    if (!url) throw new Error('서버 주소(API_URL)가 설정되지 않았어요. 선생님께 알려 주세요.');
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args }),
        redirect: 'follow'
      });
    } catch (e) {
      var err = new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      err.network = true;
      throw err;
    }
    var json;
    try { json = await res.json(); } catch (e) {
      var err2 = new Error('서버 응답을 읽지 못했어요. (배포 설정에서 액세스 권한이 "모든 사용자"인지 확인)');
      err2.network = true;
      throw err2;
    }
    if (!json.ok) throw new Error(json.error || '알 수 없는 오류');
    return json.data;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /** 줄바꿈을 살려서 출력 */
  function escBr(s) { return esc(s).replace(/\n/g, '<br>'); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    var box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, type === 'error' ? 4200 : 2600);
    setTimeout(function () { t.remove(); }, type === 'error' ? 4600 : 3000);
  }

  /**
   * 모달. buttons: [{ label, value, cls }]. 누른 버튼의 value로 resolve (배경 클릭 = null)
   * onOpen(el): 모달 안 요소에 이벤트 연결용
   */
  function modal(opts) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'modal-bg';
      var buttons = opts.buttons || [{ label: '확인', value: true, cls: 'primary' }];
      bg.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
        (opts.title ? '<h2>' + esc(opts.title) + '</h2>' : '') +
        '<div class="modal-body">' + (opts.html || '') + '</div>' +
        '<div class="modal-actions">' + buttons.map(function (b, i) {
          return '<button class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + esc(b.label) + '</button>';
        }).join('') + '</div></div>';
      function close(v) { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape' && opts.dismissable !== false) close(null); }
      bg.addEventListener('click', function (e) {
        if (e.target === bg && opts.dismissable !== false) close(null);
        var b = e.target.closest('[data-i]');
        if (b && b.parentElement.classList.contains('modal-actions')) {
          var btn = buttons[Number(b.dataset.i)];
          if (btn.before && btn.before(bg) === false) return;
          close(btn.value);
        }
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(bg);
      if (opts.onOpen) opts.onOpen(bg);
      var first = bg.querySelector('input, textarea');
      if (first) setTimeout(function () { first.focus(); }, 50);
    });
  }

  function confirmBox(title, html, okLabel, cls) {
    return modal({
      title: title, html: html,
      buttons: [{ label: '취소', value: false, cls: 'ghost' }, { label: okLabel || '확인', value: true, cls: cls || 'primary' }]
    });
  }

  /** 버튼을 누르는 동안 비활성화 + 오류 토스트 */
  async function busy(btn, task) {
    if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> 잠시만…'; }
    try { return await task(); }
    catch (e) { toast(e.message, 'error'); throw e; }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label; } }
  }

  function confetti(colors) {
    var box = document.createElement('div');
    box.className = 'confetti';
    var cs = colors && colors.length ? colors : ['#f7c54d', '#38d6c4', '#7aa2ff', '#ff6b6b', '#ffffff'];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = cs[i % cs.length];
      p.style.animationDuration = (2.2 + Math.random() * 2.2) + 's';
      p.style.animationDelay = (Math.random() * .8) + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5500);
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /** 이 기후라서? — 이유 칸에 기후 특징 낱말이 들어 있는지 가볍게 확인 */
  var CLIMATE_WORDS = ['기후', '기온', '온도', '덥', '더위', '더운', '뜨거', '춥', '추위', '추운', '추워', '따뜻', '서늘', '시원', '비가', '비를', '비는', '빗물', '강수', '건조', '습', '눈', '바람', '햇빛', '햇볕', '태양', '모래', '사막', '얼음', '얼어', '겨울', '여름', '계절', '사계절', '일교차', '고도', '높은 곳', '산비탈', '홍수', '가뭄', '태풍', '어둠', '영하', '℃'];
  function mentionsClimate(text, climateName) {
    var t = String(text || '');
    if (!t.trim()) return false;
    if (climateName && t.indexOf(climateName) >= 0) return true;
    return CLIMATE_WORDS.some(function (w) { return t.indexOf(w) >= 0; });
  }

  window.Expo = {
    api: api, apiUrl: apiUrl, esc: esc, escBr: escBr, $: $, $all: $all, toast: toast, modal: modal,
    confirmBox: confirmBox, busy: busy, confetti: confetti, store: store, mentionsClimate: mentionsClimate
  };
})();
