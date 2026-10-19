/* 서버 함수 시험: node dev/test-server.js */
'use strict';
const assert = require('assert');
const { createGas } = require('./mock-gas');
const g = createGas();
g.console = { log() {}, error() {} };

function call(fn, ...args) {
  const r = g.handle_(fn, args);
  if (!r.ok) throw new Error(fn + ' 실패: ' + r.error);
  return JSON.parse(JSON.stringify(r.data)); // 실제처럼 JSON으로 주고받기
}
function fails(fn, args, re) {
  const r = g.handle_(fn, args);
  assert.ok(!r.ok, fn + ' 은 실패해야 함');
  if (re) assert.match(r.error, re);
  return r.error;
}
const sheetNames = () => g._ss.getSheets().map((s) => s.getName());

// 1) 시트 자동 생성
fails('adminLogin', ['0000'], /PIN/);
assert.deepStrictEqual(sheetNames(), ['Settings', 'Teams', 'Students', 'Climates', 'Disasters', 'Designs', 'DisasterResponses', 'Votes', 'Reviews', 'Export_Points', 'World_Buildings']);
const tok = call('adminLogin', '1234').token;

// 2) 명단 입력 (팀 칸 비우면 자동 배정)
const roster = ['번호,이름,팀'].concat(Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},`)).join('\n');
let st = call('adminSaveRoster', tok, roster, 6, 'order');
assert.strictEqual(st.dashboard.length, 6);
assert.strictEqual(st.studentCount, 24);
st.dashboard.forEach((t) => assert.strictEqual(t.members.length, 4));
const codes = st.dashboard.map((t) => t.code);
assert.strictEqual(new Set(codes).size, 6);

// 3) 경매 결과를 "번호,이름,기후"로 입력 → 같은 기후끼리 팀, 팀 코드는 유지
const CL = ['열대', '건조', '온대', '냉대', '한대', '고산'];
fails('adminSaveRoster', [tok, '1,가,열대\n2,나,사막', 6, 'order'], /알아볼 수 없/);
fails('adminSaveRoster', [tok, '1,가,열대\n2,나,', 6, 'order'], /기후가 빠진/);
const roster2 = ['번호,이름,기후'].concat(Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},${CL[Math.floor(i / 4)]}${i % 2 ? '팀' : ''}`)).join('\n');
st = call('adminSaveRoster', tok, roster2, 6, 'order');
assert.deepStrictEqual(st.dashboard.map((t) => t.climate), CL, '기후별 팀');
assert.deepStrictEqual(st.dashboard.map((t) => t.name), CL.map((c) => c + '팀'));
assert.deepStrictEqual(st.dashboard.map((t) => t.code), codes, '팀 코드 유지');
st.dashboard.forEach((t) => assert.strictEqual(t.members.length, 4));
// 교사 기후 변경: 겹치면 거절, 비우고 다시 정하기
fails('adminSetClimate', [tok, 'T1', '건조'], /이미/);
st = call('adminSetClimate', tok, 'T1', '');
assert.strictEqual(st.dashboard[0].climate, '');
st = call('adminSetClimate', tok, 'T1', '열대');
assert.strictEqual(st.dashboard[0].climate, '열대');
assert.ok(!g.handle_('drawClimate', []).ok, '학생 뽑기 기능 없음');
const look = call('lookupTeam', codes[0].toLowerCase());
assert.strictEqual(look.members.length, 4);
st.dashboard.forEach((t) => call('login', t.code, t.members[0].no));
assert.strictEqual(call('state', codes[0], 1).climateInfo.name, '열대');

// 4) 직책: 팀 안 중복 불가
const t0 = st.dashboard[0];
const roles = ['housing', 'energy', 'food', 'transport'];
t0.members.forEach((m, i) => call('chooseRole', t0.code, m.no, roles[i]));
fails('chooseRole', [t0.code, t0.members[0].no, 'energy'], /이미/);
let s0 = call('state', t0.code, t0.members[0].no);
assert.ok(s0.stages[0].done, '1단계 완료');
assert.ok(!s0.stages[1].open, '2단계는 잠김');

// 5) 2단계 설계: 잠겨 있으면 실패 → 열면 저장, 남의 직책 칸은 실패, 충돌 감지
fails('saveDesign', [t0.code, t0.members[0].no, 'city_name', '열대 도시', ''], /잠겨/);
call('adminSetSetting', tok, 'STAGE2_OPEN', true);
let r = call('saveDesign', t0.code, t0.members[0].no, 'city_name', '=1+1 도시', '');
assert.ok(r.saved);
s0 = call('state', t0.code, t0.members[1].no);
assert.strictEqual(s0.design.city_name, '=1+1 도시', '수식으로 바뀌지 않음');
fails('saveDesign', [t0.code, t0.members[1].no, 'housing_what', '집', ''], /담당/);
r = call('saveDesign', t0.code, t0.members[1].no, 'city_name', '다른 이름', '옛날 값');
assert.ok(r.conflict && r.current === '=1+1 도시');
// 모든 칸 채우기
s0.designFields.forEach((f) => {
  const holder = f.role ? t0.members[roles.indexOf(f.role)] : t0.members[2];
  const cur = call('state', t0.code, holder.no).design[f.key];
  call('saveDesign', t0.code, holder.no, f.key, f.key === 'city_name' ? '비구름 도시' : '3/4 내용 ' + f.key, cur);
});
s0 = call('state', t0.code, t0.members[0].no);
assert.ok(s0.stages[1].done, '2단계 완료');
assert.strictEqual(s0.design.housing_what, '3/4 내용 housing_what', '날짜로 바뀌지 않음');

// 5-1) 교사 피드백
st = call('adminSetFeedback', tok, t0.id, 2, '이유에 기후 특징이 잘 들어갔어요.');
assert.strictEqual(st.dashboard[0].fb2, '이유에 기후 특징이 잘 들어갔어요.');
assert.strictEqual(call('state', t0.code, t0.members[1].no).team.fb2, '이유에 기후 특징이 잘 들어갔어요.');
fails('adminSetFeedback', [tok, t0.id, 4, 'x'], /단계/);

// 6) 팀별 단계 덮어쓰기
call('adminSetOverride', tok, t0.id, 3, '열림');
s0 = call('state', t0.code, t0.members[0].no);
assert.ok(s0.stages[2].open);
const other = st.dashboard[1];
assert.ok(!call('state', other.code, other.members[0].no).stages[2].open);

// 7) 재난: 학생 뽑기 + 교사 배부
s0 = call('drawDisaster', t0.code, t0.members[0].no);
assert.ok(s0.disaster && (s0.disaster.climate === s0.team.climate || s0.disaster.wild));
st = call('adminDistributeDisasters', tok);
assert.ok(st.dashboard.every((t) => t.disaster), '모든 팀 재난 배정');
// 기후를 바꾸면 그 기후 재난 카드는 비워짐(공통 와일드카드는 유지)
{
  const before = call('adminState', tok).dashboard[5];
  const after = call('adminSetClimate', tok, before.id, '').dashboard[5];
  assert.ok(!after.disaster || after.disaster.wild);
  call('adminSetClimate', tok, before.id, before.climate);
  call('adminSetTeamDisaster', tok, before.id, before.disaster.id);
}
fails('saveResponse', [other.code, other.members[0].no, 'survive', '버팀', ''], /잠겨/);
call('saveResponse', t0.code, t0.members[0].no, 'survive', '물길을 만든다', '');
call('saveResponse', t0.code, t0.members[1].no, 'fix', '바닥을 더 높였다', '');
assert.ok(call('state', t0.code, t0.members[0].no).stages[2].done);

// 8) 4단계: 포스터 + 엑스포 + 투표
call('adminSetSetting', tok, 'STAGE4_OPEN', true);
fails('submitPoster', [t0.code, t0.members[0].no, 'canva.com/abc'], /https/);
s0 = call('submitPoster', t0.code, t0.members[0].no, 'https://www.canva.com/design/abc/view');
assert.ok(s0.stages[3].done);
assert.strictEqual(s0.expo.length, 6);
// 투자 심사표: 기준 입력 → (투표 열림) 모든 팀 심사 + 모든 팀 이유 + 코인 10개 모두
const items = (team, alloc) => {
  const o = {};
  st.dashboard.filter((t) => t.id !== team.id).forEach((t) => {
    o[t.id] = { marks: ['◎', '○', '△'], memo: '질문: 왜 그렇게?', coins: alloc[t.id] || 0, reason: '열대 기후라서 바닥을 띄웠기 때문에' };
  });
  return o;
};
fails('submitReview', [t0.code, t0.members[0].no, items(t0, { T2: 10 })], /열리지/);
call('adminSetSetting', tok, 'VOTING_OPEN', true);
fails('submitReview', [t0.code, t0.members[0].no, items(t0, { T2: 10 })], /기준/);
call('adminSetSetting', tok, 'REVIEW_CRITERIA', '기후 맞춤\n재난 대비\n전통 계승과 미래 기술');
assert.deepStrictEqual(call('state', t0.code, t0.members[0].no).settings.criteria, ['기후 맞춤', '재난 대비', '전통 계승과 미래 기술']);
{
  const bad = items(t0, { T2: 10 }); bad.T3.reason = '';
  fails('submitReview', [t0.code, t0.members[0].no, bad], /T?3|비어/);
  const bad2 = items(t0, { T2: 10 }); bad2.T4.marks = ['◎'];
  fails('submitReview', [t0.code, t0.members[0].no, bad2], /심사/);
  fails('submitReview', [t0.code, t0.members[0].no, items(t0, { T2: 11 })], /까지/);
  fails('submitReview', [t0.code, t0.members[0].no, items(t0, {})], /1개 이상/);
  const bad3 = items(t0, { T2: 10 }); bad3.T1 = { marks: ['◎', '◎', '◎'], coins: 0, reason: 'x' };
  fails('submitReview', [t0.code, t0.members[0].no, bad3], /우리 팀/);
}
// 1차 투자는 일부만(회수 불가), 마지막 추가 투자로 남은 코인 모두
{
  const m0 = t0.members[0].no;
  let ss = call('submitReview', t0.code, m0, items(t0, { T2: 6 }));
  assert.ok(ss.vote.submitted && !ss.vote.done && ss.vote.remaining === 4);
  fails('submitReview', [t0.code, m0, items(t0, { T3: 4 })], /이미/);
  fails('topUpReview', [t0.code, m0, { T3: { coins: 4, reason: '' } }], /이유/);
  fails('topUpReview', [t0.code, m0, { T3: { coins: 3, reason: '재난 대비가 좋아서' } }], /모두/);
  assert.ok(call('adminState', tok).leftovers.some((x) => String(x.no) === String(m0) && x.left === 4));
  ss = call('topUpReview', t0.code, m0, { T3: { coins: 4, reason: '건조 기후라서 물을 다시 쓰기 때문에' } });
  assert.ok(ss.vote.done && ss.vote.remaining === 0);
  assert.strictEqual(ss.vote.mine.find((v) => v.target === 'T3').coins, 4);
  fails('topUpReview', [t0.code, m0, { T3: { coins: 1, reason: 'x' } }], /남은 코인|한 번/);
}
st.dashboard.forEach((t) => {
  t.members.forEach((m) => {
    if (String(m.no) === String(t0.members[0].no)) return;
    const alloc = t.id === 'T1' ? { T2: 6, T3: 4 } : { T1: 7, [t.id === 'T2' ? 'T3' : 'T2']: 3 };
    call('submitReview', t.code, m.no, items(t, alloc));
  });
});
assert.strictEqual(call('adminState', tok).leftovers.length, 0);
fails('submitReview', [t0.code, t0.members[0].no, items(t0, { T2: 10 })], /이미/);
st = call('adminState', tok);
assert.strictEqual(st.voteCount, 24);
assert.strictEqual(st.results[0].id, 'T1');
assert.strictEqual(st.results[0].coins, 140);
assert.strictEqual(st.results.reduce((a, b) => a + b.coins, 0), 240);
assert.strictEqual(st.results[0].stats[0].counts['◎'], 20);
assert.strictEqual(st.results[0].stats[2].avg, 1);
assert.strictEqual(st.results[0].details.length, 20, '교사: 누가 얼마나');
assert.ok(st.results[0].details[0].voterName);
assert.ok(!call('state', t0.code, t0.members[0].no).results, '공개 전');
call('adminSetSetting', tok, 'RESULTS_PUBLIC', true);
{
  const pub = call('state', t0.code, t0.members[0].no).results;
  assert.strictEqual(pub[0].id, 'T1');
  assert.ok(!pub[0].details, '학생 공개용에는 누가 얼마나가 없음');
  assert.ok(!JSON.stringify(pub).includes('학생'), '이름 없음');
  assert.strictEqual(pub[0].reasons[0].coins, 7);
}

// 9) 포인트·월드 (1등 상금 15, 1등 도시 투자 성공 = 코인÷2 반올림)
st = call('adminExportPoints', tok);
const pts = st.exported;
const t1pts = pts.filter((p) => String(p.no) === String(t0.members[0].no)).map((p) => p.code).sort();
assert.deepStrictEqual(t1pts, ['DISASTER', 'STAGE1', 'STAGE2', 'STAGE4', 'VOTE', 'WIN1']);
assert.strictEqual(pts.find((p) => p.code === 'WIN1').points, 15);
const t2m = st.dashboard[1].members[0].no;
const inv = pts.find((p) => String(p.no) === String(t2m) && p.code === 'INVEST');
assert.strictEqual(inv.points, 4, '7코인 ÷ 2 = 3.5 → 반올림 4');
assert.ok(pts.some((p) => String(p.no) === String(t2m) && p.code === 'WIN2'));
st = call('adminRegisterWorld', tok, 'T1');
assert.strictEqual(st.world.length, 1);
assert.strictEqual(st.world[0].city, '비구름 도시');
call('adminRegisterWorld', tok, 'T1');
assert.strictEqual(call('adminState', tok).world.length, 1, '같은 도시는 한 줄');

// 10) 투표 취소, 카드 편집, 초기화
st = call('adminResetVote', tok, t0.members[0].no);
assert.strictEqual(st.voteCount, 23);
st = call('adminSaveCard', tok, 'Climates', '열대', { desc: '바뀐 설명' });
assert.strictEqual(st.climates.find((c) => c.name === '열대').desc, '바뀐 설명');
fails('adminResetAll', [tok, '아니', false], /확인/);
st = call('adminResetAll', tok, '초기화', false);
assert.ok(st.dashboard.every((t) => !t.climate && !t.disaster));
assert.strictEqual(st.studentCount, 24);
assert.strictEqual(st.voteCount, 0);
assert.strictEqual(st.world.length, 1, '월드 기록은 남김');
fails('adminState', ['bad-token'], /ADMIN_AUTH/);

console.log('서버 시험 통과 ✔');
