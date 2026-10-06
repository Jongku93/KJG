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
    adminSetClimate: apiAdminSetClimate,
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
