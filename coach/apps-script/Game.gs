/**
 * 紀律健身房 × 健康26 — 遊戲用接口
 *
 * 把這個檔案加進「健康26」的 Apps Script 專案（和 程式碼.gs、Index.html 放在一起）。
 * 它只新增 doPost()，不會影響原本的健康26 網頁（doGet）。
 * 會用到 程式碼.gs 裡已經有的：SHEET_NAME、callGeminiFast()、findTargetRow()、getDailySummary()
 *
 * 需要在「專案設定 → 指令碼屬性」新增：
 *   APP_TOKEN       自己編一組暗號，遊戲設定頁要填一樣的
 *   GEMINI_API_KEY  （建議）新的 Gemini key；程式碼.gs 第 4 行改成讀這個屬性，見 README
 */

const GAME_RECORDS_SHEET = '遊戲紀錄';
const GAME_HEADERS = ['date', 'updatedAt', 'points', 'weight', 'fat', 'waist', 'exType', 'exMin', 'steps',
  'water', 'noSugar', 'note', 'json'];

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return gameJson_({ ok: false, error: 'JSON 格式錯誤' }); }
  const want = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!want || body.token !== want) return gameJson_({ ok: false, error: '暗號 APP_TOKEN 不正確' });
  try {
    switch (body.action) {
      case 'ping': return gameJson_({ ok: true, message: 'pong', hasGemini: true, food: true });
      case 'save': return gameJson_({ ok: true, saved: gameSaveRecords_(body.records || []) });
      case 'list': return gameJson_({ ok: true, records: gameListRecords_() });
      case 'food': return gameJson_({ ok: true, days: gameFoodRange_(body.days || 30) });
      case 'ask': return gameJson_({ ok: true, answer: gameAsk_(body) });
      default: return gameJson_({ ok: false, error: '未知的 action' });
    }
  } catch (err) {
    return gameJson_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- 讀「健康26」：每天佔 3 列（名稱／熱量／蛋白質），A 欄日期，C 欄總熱量，D 欄總蛋白質 ----------
function gameFoodRange_(days) {
  days = Math.max(1, Math.min(120, Number(days) || 30));
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('找不到工作表「' + SHEET_NAME + '」');
  const lastRow = sheet.getLastRow();
  const colA = sheet.getRange(1, 1, lastRow, 1).getDisplayValues();
  const tz = Session.getScriptTimeZone();
  const wanted = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    wanted[Utilities.formatDate(d, tz, 'yyyy/MM/dd')] = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    wanted[Utilities.formatDate(d, tz, 'yyyy/M/d')] = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  const out = [];
  const headers = sheet.getRange(1, 1, 1, 22).getDisplayValues()[0];
  for (let r = 0; r < colA.length; r++) {
    const iso = wanted[String(colA[r][0]).trim()];
    if (!iso) continue;
    const block = sheet.getRange(r + 1, 1, 3, 22).getDisplayValues();
    const items = [];
    let snackKcal = 0;
    for (let c = 4; c < 22; c++) {
      const name = String(block[0][c] || '').trim();
      const kcal = Number(String(block[1][c] || '').replace(/,/g, '')) || 0;
      const pro = Number(String(block[2][c] || '').replace(/,/g, '')) || 0;
      if (!name && !kcal) continue;
      const isSnack = (c === 11 || c === 17 || c === 21); // L、R、V 欄：零食區
      if (isSnack) snackKcal += kcal;
      items.push({ col: columnToLetter(c + 1), slot: headers[c] || '', name, kcal, protein: pro, snack: isSnack });
    }
    const totalKcal = Number(String(block[1][2] || '').replace(/,/g, '')) || items.reduce((a, b) => a + b.kcal, 0);
    const totalPro = Number(String(block[2][3] || '').replace(/,/g, '')) || items.reduce((a, b) => a + b.protein, 0);
    out.push({ date: iso, kcal: totalKcal, protein: Math.round(totalPro * 10) / 10, snackKcal, items });
    delete wanted[String(colA[r][0]).trim()];
  }
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}

// ---------- 遊戲的運動／體重紀錄：存在「遊戲紀錄」分頁 ----------
function gameSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GAME_RECORDS_SHEET);
  if (!sh) { sh = ss.insertSheet(GAME_RECORDS_SHEET); sh.appendRow(GAME_HEADERS); sh.setFrozenRows(1); }
  return sh;
}

function gameSaveRecords_(records) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = gameSheet_();
    const last = sh.getLastRow();
    const dates = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]) : [];
    let n = 0;
    records.forEach(item => {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return;
      const r = item.record || {};
      const row = [item.date, item.updatedAt || new Date().toISOString(), item.points ?? '',
        r.weight ?? '', r.fat ?? '', r.waist ?? '', r.exType ?? '', r.exMin ?? '', r.steps ?? '',
        r.water ?? '', r.noSugar ? 'Y' : '', r.note ?? '', JSON.stringify(r)];
      const idx = dates.indexOf(item.date);
      if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
      else { sh.appendRow(row); dates.push(item.date); }
      n++;
    });
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
    return n;
  } finally { lock.releaseLock(); }
}

function gameListRecords_() {
  const sh = gameSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GAME_HEADERS.length).getDisplayValues().map(v => {
    let record = {};
    try { record = JSON.parse(v[GAME_HEADERS.length - 1] || '{}'); } catch (e) {}
    return { date: v[0], updatedAt: v[1], points: v[2], record };
  }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
}

// ---------- 問教練：沿用健康26 的 callGeminiFast ----------
function gameAsk_(body) {
  const coach = body.coachName || '教練';
  const system = [
    `你是「${coach}」，紀律健身房的減脂教練，正在跟學員對話。`,
    '說話風格：元氣、熱血、有點嚴格但很關心學員，偶爾用「呀哈！」「嗶嗶！」之類的口頭禪。',
    '一律使用繁體中文，回答精簡（150 字以內），用自然段落、不要畫表格，給具體可執行的建議。',
    '依據學員提供的目標、飲食與運動紀錄回答；資料不足時直接說需要哪些資料。',
    '涉及疾病、藥物、極端節食或身體不適時，提醒學員諮詢醫師或營養師。',
  ].join('\n');
  const contents = [];
  (body.history || []).slice(-8).forEach(h => {
    if (h && h.text) contents.push({ role: h.role === 'coach' ? 'model' : 'user', parts: [{ text: String(h.text).slice(0, 2000) }] });
  });
  const ctx = body.context ? `【學員資料】\n${String(body.context).slice(0, 8000)}\n\n` : '';
  contents.push({ role: 'user', parts: [{ text: ctx + '【學員的問題】\n' + String(body.question || '請點評我今天的紀錄').slice(0, 1000) }] });
  const text = callGeminiFast({ system_instruction: { parts: [{ text: system }] }, contents }, false);
  return String(text || '').trim() || '（教練一時語塞……再問一次看看！）';
}

function gameJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 在編輯器選這個函式按「執行」，可以看到最近 3 天從健康26 讀到的熱量（看「執行記錄」）。 */
function testGameFood() {
  Logger.log(JSON.stringify(gameFoodRange_(3), null, 2));
}
