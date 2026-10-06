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
assert.deepStrictEqual(sheetNames(), ['Settings', 'Teams', 'Students', 'Climates', 'Disasters', 'Designs', 'DisasterResponses', 'Votes', 'Export_Points', 'World_Buildings']);
const tok = call('adminLogin', '1234').token;

// 2) 명단 입력 (팀 칸 비우면 자동 배정)
const roster = ['번호,이름,팀'].concat(Array.from({ length: 24 }, (_, i) => `${i + 1},학생${i + 1},`)).join('\n');
let st = call('adminSaveRoster', tok, roster, 6, 'order');
assert.strictEqual(st.dashboard.length, 6);
assert.strictEqual(st.studentCount, 24);
st.dashboard.forEach((t) => assert.strictEqual(t.members.length, 4));
const codes = st.dashboard.map((t) => t.code);
assert.strictEqual(new Set(codes).size, 6);

// 3) 학생 로그인 + 기후 뽑기 (중복 없음)
const look = call('lookupTeam', codes[0].toLowerCase());
assert.strictEqual(look.members.length, 4);
const drawn = [];
st.dashboard.forEach((t, i) => {
  const no = t.members[0].no;
  call('login', t.code, no);
  const s = call('drawClimate', t.code, no);
  drawn.push(s.team.climate);
  // 다시 뽑아도 그대로
  assert.strictEqual(call('drawClimate', t.code, no).team.climate, s.team.climate);
});
assert.strictEqual(new Set(drawn).size, 6, '기후 중복 없음');

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
fails('submitVote', [t0.code, t0.members[0].no, { T2: 10 }, {}], /열리지/);
call('adminSetSetting', tok, 'VOTING_OPEN', true);
fails('submitVote', [t0.code, t0.members[0].no, { T1: 5, T2: 5 }, {}], /우리 팀/);
fails('submitVote', [t0.code, t0.members[0].no, { T2: 4 }, {}], /모두/);
st.dashboard.forEach((t) => {
  t.members.forEach((m) => {
    const target = t.id === 'T1' ? { T2: 6, T3: 4 } : { T1: 7, [t.id === 'T2' ? 'T3' : 'T2']: 3 };
    call('submitVote', t.code, m.no, target, { T1: '비를 피하는 설계가 좋아요' });
  });
});
fails('submitVote', [t0.code, t0.members[0].no, { T2: 10 }, {}], /이미/);
st = call('adminState', tok);
assert.strictEqual(st.voteCount, 24);
assert.strictEqual(st.results[0].id, 'T1');
assert.strictEqual(st.results.reduce((a, b) => a + b.coins, 0), 240);
assert.ok(!call('state', t0.code, t0.members[0].no).results, '공개 전');
call('adminSetSetting', tok, 'RESULTS_PUBLIC', true);
assert.strictEqual(call('state', t0.code, t0.members[0].no).results[0].id, 'T1');

// 9) 포인트·월드
st = call('adminExportPoints', tok);
const pts = st.exported;
const t1pts = pts.filter((p) => String(p.no) === String(t0.members[0].no)).map((p) => p.code).sort();
assert.deepStrictEqual(t1pts, ['DISASTER', 'STAGE1', 'STAGE2', 'STAGE4', 'VOTE', 'WIN1']);
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
