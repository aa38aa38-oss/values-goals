/**
 * 紀律健身房 → 「記帳」試算表 同步橋接
 *
 * 加在「健康26」那個 Apps Script 專案裡（和 程式碼.gs、Index.html 放一起）。
 * 只新增 doPost()，不影響原本健康26 網頁（doGet）。
 * 會用到 程式碼.gs 已經有的：saveFoodRecord()、findTargetRow()、columnToLetter()、callGeminiFast()
 *
 * 指令碼屬性需要：
 *   APP_TOKEN       自己編的暗號，遊戲設定頁填一樣的
 *   GEMINI_API_KEY  （健康26 原本就要用）
 */

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return syncJson_({ ok: false, error: 'JSON 格式錯誤' }); }
  const want = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!want || body.token !== want) return syncJson_({ ok: false, error: '暗號 APP_TOKEN 不正確' });
  try {
    switch (body.action) {
      case 'ping': return syncJson_({ ok: true, message: 'pong', hasGemini: true, sheets: true });
      case 'syncFood': return syncJson_({ ok: true, results: syncFood_(body.items || []) });
      case 'syncExpense': return syncJson_({ ok: true, results: syncExpense_(body.items || []) });
      case 'save': return syncJson_({ ok: true, saved: gameSave_(body.records || []) });
      case 'list': return syncJson_({ ok: true, records: gameList_() });
      case 'ask': return syncJson_({ ok: true, answer: gameAsk_(body) });
      default: return syncJson_({ ok: false, error: '未知的 action' });
    }
  } catch (err) {
    return syncJson_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- 避免重複登記：記住最近已寫入的項目 id ----------
function syncedIds_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SYNCED_IDS') || '[]'); } catch (e) { return []; }
}
function rememberIds_(ids) {
  const all = syncedIds_().concat(ids);
  PropertiesService.getScriptProperties().setProperty('SYNCED_IDS', JSON.stringify(all.slice(-400)));
}

// ---------- 1. 飲食 → 「健康26」：直接用健康26 原本的 saveFoodRecord（同一套欄位規則） ----------
function syncFood_(items) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const done = syncedIds_(), newIds = [], results = [];
    items.forEach(it => {
      if (!it || !it.id) return;
      if (done.indexOf(it.id) >= 0) { results.push({ id: it.id, ok: true, dup: true }); return; }
      try {
        const r = saveFoodRecord({
          dateStr: it.date, timeStr: it.time || '12:00', slotMode: it.slot || 'auto',
          isSnack: !!it.snack, foodName: it.name, calories: it.kcal, protein: it.protein,
        });
        newIds.push(it.id);
        results.push({ id: it.id, ok: true, where: r.savedRange });
      } catch (e) { results.push({ id: it.id, ok: false, error: String(e.message || e) }); }
    });
    if (newIds.length) rememberIds_(newIds);
    return results;
  } finally { lock.releaseLock(); }
}

// ---------- 2. 記帳 → 「26H2」等分頁：每天兩列（上：項目名稱、下：金額），依第 1 列標題找欄位 ----------
const EXPENSE_DEFAULT_COL = { '早交通': 3, '早餐': 4, '午餐': 5, '晚交通': 6, '晚餐': 7, '運動': 8, '買菜': 9, '電話費': 10, '交際娛樂': 11, '媽媽費': 12, '其他': 13 };

function expenseSheetName_(dateStr) {
  const p = dateStr.split('-').map(Number);
  return String(p[0] % 100) + 'H' + (p[1] <= 6 ? 1 : 2); // 2026-11-18 → 26H2
}

function expenseColumns_(sheet, cat) {
  const headers = sheet.getRange(1, 1, 1, Math.min(40, sheet.getLastColumn())).getDisplayValues()[0];
  const cols = [];
  headers.forEach((h, i) => { if (String(h).replace(/\s/g, '').indexOf(cat) >= 0) cols.push(i + 1); });
  if (!cols.length && EXPENSE_DEFAULT_COL[cat]) cols.push(EXPENSE_DEFAULT_COL[cat]);
  if (cat === '其他' && cols.length === 1) for (let c = cols[0] + 1; c <= cols[0] + 5; c++) cols.push(c); // M～R
  return cols;
}

function syncExpense_(items) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const done = syncedIds_(), newIds = [], results = [];
    items.forEach(it => {
      if (!it || !it.id) return;
      if (done.indexOf(it.id) >= 0) { results.push({ id: it.id, ok: true, dup: true }); return; }
      try {
        const name = expenseSheetName_(it.date);
        const sheet = ss.getSheetByName(name);
        if (!sheet) throw new Error('找不到分頁「' + name + '」');
        const found = findTargetRow(sheet, it.date);
        if (found.targetRow === -1) throw new Error('「' + name + '」A 欄找不到日期 ' + found.formattedTarget + '，請先把日期拉好');
        const row = found.targetRow;
        const cols = expenseColumns_(sheet, it.cat);
        if (!cols.length) throw new Error('「' + name + '」第 1 列找不到「' + it.cat + '」欄');
        const vals = sheet.getRange(row, 1, 2, Math.max.apply(null, cols)).getValues();
        let col = cols[cols.length - 1], append = true;
        for (const c of cols) {
          if (String(vals[0][c - 1] || '').trim() === '' && (vals[1][c - 1] === '' || vals[1][c - 1] === null)) { col = c; append = false; break; }
        }
        const amt = Number(it.amount) || 0, label = String(it.name || it.cat).trim();
        if (!append) sheet.getRange(row, col, 2, 1).setValues([[label], [amt]]);
        else {
          const oldName = String(vals[0][col - 1] || '').trim();
          sheet.getRange(row, col, 2, 1).setValues([[oldName ? oldName + '、' + label : label], [(Number(vals[1][col - 1]) || 0) + amt]]);
        }
        newIds.push(it.id);
        results.push({ id: it.id, ok: true, where: name + '!' + columnToLetter(col) + row });
      } catch (e) { results.push({ id: it.id, ok: false, error: String(e.message || e) }); }
    });
    SpreadsheetApp.flush();
    if (newIds.length) rememberIds_(newIds);
    return results;
  } finally { lock.releaseLock(); }
}

// ---------- 遊戲的運動／體重備份（「遊戲紀錄」分頁） ----------
const GAME_SHEET = '遊戲紀錄';
const GAME_HEADERS = ['date', 'updatedAt', 'points', 'weight', 'fat', 'waist', 'exType', 'exMin', 'steps', 'water', 'noSugar', 'note', 'json'];
function gameSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GAME_SHEET);
  if (!sh) { sh = ss.insertSheet(GAME_SHEET); sh.appendRow(GAME_HEADERS); sh.setFrozenRows(1); }
  return sh;
}
function gameSave_(records) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = gameSheet_(), last = sh.getLastRow();
    const dates = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]) : [];
    let n = 0;
    records.forEach(item => {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return;
      const r = item.record || {};
      const row = [item.date, item.updatedAt || new Date().toISOString(), item.points ?? '', r.weight ?? '', r.fat ?? '', r.waist ?? '',
        r.exType ?? '', r.exMin ?? '', r.steps ?? '', r.water ?? '', r.noSugar ? 'Y' : '', r.note ?? '', JSON.stringify(r)];
      const idx = dates.indexOf(item.date);
      if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]); else { sh.appendRow(row); dates.push(item.date); }
      n++;
    });
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
    return n;
  } finally { lock.releaseLock(); }
}
function gameList_() {
  const sh = gameSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GAME_HEADERS.length).getDisplayValues().map(v => {
    let record = {}; try { record = JSON.parse(v[GAME_HEADERS.length - 1] || '{}'); } catch (e) {}
    return { date: v[0], updatedAt: v[1], points: v[2], record };
  }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
}

// ---------- 問教練（沿用健康26 的 callGeminiFast） ----------
function gameAsk_(body) {
  const coach = body.coachName || '教練';
  const system = '你是「' + coach + '」，紀律健身房的減脂教練兼營養師。元氣、熱血、有點嚴格但關心學員。一律繁體中文，自然段落、不畫表格，150 字內，給具體建議。涉及疾病或極端節食時提醒諮詢醫師。';
  const contents = [];
  (body.history || []).slice(-8).forEach(h => { if (h && h.text) contents.push({ role: h.role === 'coach' ? 'model' : 'user', parts: [{ text: String(h.text).slice(0, 2000) }] }); });
  contents.push({ role: 'user', parts: [{ text: (body.context ? '【學員資料】\n' + String(body.context).slice(0, 8000) + '\n\n' : '') + '【學員的問題】\n' + String(body.question || '').slice(0, 1000) }] });
  return String(callGeminiFast({ system_instruction: { parts: [{ text: system }] }, contents: contents }, false) || '').trim();
}

function syncJson_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** 在編輯器選這個函式按「執行」，會在今天的 26H2 早餐欄試寫一筆 1 元（測試完記得手動刪掉）。 */
function testExpense() {
  const tz = Session.getScriptTimeZone();
  Logger.log(JSON.stringify(syncExpense_([{ id: 'test-' + Date.now(), date: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), cat: '早餐', name: '測試', amount: 1 }])));
}
