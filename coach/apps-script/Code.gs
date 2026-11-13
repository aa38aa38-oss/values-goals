/**
 * 紀律健身房 — Google Apps Script 後端
 * 功能：
 *   1. 把每天的紀錄存進 Google 試算表（永久存檔）
 *   2. 讀回全部紀錄（給遊戲畫圖表、換手機還原）
 *   3. 呼叫 Gemini，讓教練回答問題（API key 只存在這裡，不會出現在網頁上）
 *
 * 設定方式見同資料夾的 README.md。
 * 需要在「專案設定 → 指令碼屬性」新增：
 *   GEMINI_API_KEY  你的 Gemini API key（Google AI Studio 申請）
 *   APP_TOKEN       自己編一組暗號，遊戲設定頁要填一樣的
 *   GEMINI_MODEL    （選填）預設 gemini-2.5-flash
 */

const SHEET_NAME = 'records';
const HEADERS = ['date', 'updatedAt', 'points', 'weight', 'fat', 'waist', 'exType', 'exMin', 'steps',
  'water', 'noSugar', 'kcal', 'breakfast', 'lunch', 'dinner', 'snack', 'note', 'json'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!checkToken_(p.token)) return json_({ ok: false, error: '暗號 APP_TOKEN 不正確' });
  if (p.action === 'list') return json_({ ok: true, records: listRecords_() });
  return json_({ ok: true, message: '紀律健身房後端運作中' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'JSON 格式錯誤' }); }
  if (!checkToken_(body.token)) return json_({ ok: false, error: '暗號 APP_TOKEN 不正確' });
  try {
    switch (body.action) {
      case 'save': return json_({ ok: true, saved: saveRecords_(body.records || []) });
      case 'list': return json_({ ok: true, records: listRecords_() });
      case 'ask': return json_({ ok: true, answer: askGemini_(body) });
      case 'ping': return json_({ ok: true, message: 'pong', hasGemini: !!prop_('GEMINI_API_KEY') });
      default: return json_({ ok: false, error: '未知的 action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- 試算表 ----------
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function saveRecords_(records) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const dates = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]) : [];
    let n = 0;
    records.forEach(item => {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return;
      const r = item.record || {};
      const m = r.meals || {};
      const row = [
        item.date, item.updatedAt || new Date().toISOString(), item.points ?? '',
        r.weight ?? '', r.fat ?? '', r.waist ?? '', r.exType ?? '', r.exMin ?? '', r.steps ?? '',
        r.water ?? '', r.noSugar ? 'Y' : '', r.kcal ?? '', m.b ?? '', m.l ?? '', m.d ?? '', m.s ?? '', r.note ?? '',
        JSON.stringify(r),
      ];
      const idx = dates.indexOf(item.date);
      if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
      else { sh.appendRow(row); dates.push(item.date); }
      n++;
    });
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
    return n;
  } finally {
    lock.releaseLock();
  }
}

function listRecords_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues();
  return vals.map(v => {
    let record = {};
    try { record = JSON.parse(v[HEADERS.length - 1] || '{}'); } catch (e) {}
    return { date: v[0], updatedAt: v[1], points: v[2], record };
  }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
}

// ---------- Gemini ----------
function askGemini_(body) {
  const key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('還沒在指令碼屬性設定 GEMINI_API_KEY');
  const model = prop_('GEMINI_MODEL') || 'gemini-2.5-flash';
  const coach = body.coachName || '教練';
  const system = [
    `你是「${coach}」，紀律健身房的減脂教練，正在跟學員對話。`,
    '說話風格：元氣、熱血、有點嚴格但很關心學員，偶爾用「呀哈！」「嗶嗶！」之類的口頭禪。',
    '一律使用繁體中文，回答精簡（150 字以內），給具體可執行的建議。',
    '依據學員提供的目標與近期紀錄回答；資料不足時直接說需要哪些資料。',
    '涉及疾病、藥物、極端節食或身體不適時，提醒學員諮詢醫師或營養師。',
  ].join('\n');

  const contents = [];
  (body.history || []).slice(-8).forEach(h => {
    if (h && h.text) contents.push({ role: h.role === 'coach' ? 'model' : 'user', parts: [{ text: String(h.text).slice(0, 2000) }] });
  });
  const ctx = body.context ? `【學員資料】\n${String(body.context).slice(0, 6000)}\n\n` : '';
  contents.push({ role: 'user', parts: [{ text: ctx + '【學員的問題】\n' + String(body.question || '請點評我今天的紀錄').slice(0, 1000) }] });

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 600 },
      }),
    });
  const code = res.getResponseCode();
  const data = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) throw new Error('Gemini 錯誤 ' + code + '：' + ((data.error && data.error.message) || ''));
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map(p => p.text || '').join('').trim();
  return text || '（教練一時語塞……再問一次看看！）';
}

// ---------- 工具 ----------
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function checkToken_(t) { const want = prop_('APP_TOKEN'); return !!want && t === want; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** 在編輯器按「執行」這個函式，可以測試 Gemini key 是否有效（結果看「執行記錄」）。 */
function testGemini() {
  Logger.log(askGemini_({ coachName: '測試教練', question: '用一句話替我加油' }));
}
