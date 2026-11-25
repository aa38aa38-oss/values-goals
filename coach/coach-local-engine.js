(() => {
  const { topics, trees, cards, synonyms } = window.CoachLocalQA;

  // 從現有 App 狀態安全讀取個人資料與當天數據（不寫死敏感資料，全讀現有 state）
  function readPersonalSnapshot(getCtx) {
    const ctx = typeof getCtx === 'function' ? getCtx() : {};
    const goals = ctx.goals || {};
    const todayRec = ctx.todayRec || {};
    const todayFood = ctx.todayFood || { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    const weight =
      parseFloat(todayRec.weight) ||
      parseFloat(ctx.latestWeight) ||
      parseFloat(goals.startWeight) ||
      null;
    return {
      weight,
      targetWeight: parseFloat(goals.targetWeight) || null,
      kcalMin: Number(goals.kcalMin) || 0,
      kcalMax: Number(goals.kcalMax) || 0,
      proteinGoal: Number(goals.protein) || 0,
      exMinGoal: Number(goals.exMin) || 0,
      waterGoal: Number(goals.water) || 0,
      stepsGoal: Number(goals.steps) || 0,
      todayKcal: Number(todayFood.kcal) || 0,
      todayProtein: Number(todayFood.protein) || 0,
      todayExMin: Number(todayRec.exMin) || 0,
      todaySteps: Number(todayRec.steps) || 0,
      todayWater: Number(todayRec.water) || 0,
    };
  }

  // 依照 hook 類型產生「先問要不要套用」的詢問文字
  function buildAskApplyPrompt(hook, snap) {
    if (hook === 'calc_protein') {
      const info = snap.weight ? `你目前參考體重約 ${snap.weight} kg` : '你的目標設定';
      const goalTxt = snap.proteinGoal ? `，目前蛋白目標 ${snap.proteinGoal} g` : '';
      return `我可以幫你用「${info}${goalTxt}」試算每日蛋白質與今天還差多少，要不要套用你的個人數據？`;
    }
    if (hook === 'calc_macros') {
      const info = snap.weight ? `體重約 ${snap.weight} kg` : '你的設定目標';
      const range = snap.kcalMax ? `、熱量目標 ${snap.kcalMin || 0}～${snap.kcalMax} kcal` : '';
      return `我可以帶入你的「${info}${range}」給你一份參考估算，要不要套用你的個人數據？`;
    }
    if (hook === 'check_activity') {
      return `我可以幫你對照今天已記錄的運動／步數與目標進度，要不要套用你今天的紀錄數據？`;
    }
    if (hook === 'check_today_diet') {
      return `我可以幫你對照今天已吃進的熱量（${snap.todayKcal} kcal）與蛋白質（${snap.todayProtein} g），要不要套用你今天的飲食紀錄？`;
    }
    return '要不要套用你的個人目標與今日紀錄來幫你做試算？';
  }

  // 使用者確認「套用」後，實際計算並產生個人化補充內容
  function computeAppliedResult(hook, snap) {
    if (hook === 'calc_protein') {
      const w = snap.weight;
      if (!w) {
        return `目前尚未偵測到體重數值，建議先在紀錄或設定填入體重；若以目標 ${snap.proteinGoal || 90} g 來看，今天已攝取 ${snap.todayProtein} g，尚差 ${Math.max(0, Math.round(((snap.proteinGoal || 90) - snap.todayProtein) * 10) / 10)} g。`;
      }
      const low = Math.round(w * 1.6);
      const high = Math.round(w * 2.0);
      const left = snap.proteinGoal ? Math.max(0, Math.round((snap.proteinGoal - snap.todayProtein) * 10) / 10) : null;
      return [
        `📊 套用體重 ${w} kg 參考計算：`,
        `• 減脂／訓練期常見蛋白參考區間：約 ${low}～${high} g／天（以 1.6～2.0 g/kg 估算）`,
        snap.proteinGoal
          ? `• 你的設定目標為 ${snap.proteinGoal} g，今天已吃 ${snap.todayProtein} g${left > 0 ? `，還差 ${left} g` : '（已達標！）'}。`
          : `• 今天已吃 ${snap.todayProtein} g。`,
      ].join('\n');
    }

    if (hook === 'calc_macros') {
      const w = snap.weight;
      const lines = ['📊 套用你的設定與數據參考：'];
      if (w) lines.push(`• 參考體重：${w} kg${snap.targetWeight ? `（目標 ${snap.targetWeight} kg）` : ''}`);
      if (snap.kcalMax) lines.push(`• 每日熱量區間：${snap.kcalMin || 0}～${snap.kcalMax} kcal（今日已記 ${snap.todayKcal} kcal）`);
      if (snap.proteinGoal) lines.push(`• 每日蛋白質目標：${snap.proteinGoal} g（今日已記 ${snap.todayProtein} g）`);
      if (w && !snap.kcalMax) lines.push(`• 粗估每日基礎／維持參考可先抓約 ${Math.round(w * 24)}～${Math.round(w * 30)} kcal，再依活動量與實際體重變化微調。`);
      return lines.join('\n');
    }

    if (hook === 'check_activity') {
      return [
        '📊 套用你今天的運動與活動紀錄：',
        `• 運動時間：今天 ${snap.todayExMin} 分鐘${snap.exMinGoal ? `（目標 ${snap.exMinGoal} 分鐘）` : ''}`,
        `• 日常步數：今天 ${snap.todaySteps} 步${snap.stepsGoal ? `（達標 ${snap.stepsGoal} 步）` : ''}`,
      ].join('\n');
    }

    return [
      '📊 套用你今天的飲食紀錄：',
      `• 熱量：今天 ${snap.todayKcal} kcal${snap.kcalMax ? `（上限 ${snap.kcalMax} kcal，剩餘 ${Math.max(0, snap.kcalMax - snap.todayKcal)} kcal）` : ''}`,
      `• 蛋白質：今天 ${snap.todayProtein} g${snap.proteinGoal ? `（目標 ${snap.proteinGoal} g，剩餘 ${Math.max(0, Math.round((snap.proteinGoal - snap.todayProtein) * 10) / 10)} g）` : ''}`,
    ].join('\n');
  }

  function normalizeQuery(raw) {
    let q = String(raw || '').toLowerCase().trim();
    Object.entries(synonyms).forEach(([k, v]) => {
      q = q.split(k.toLowerCase()).join(v.toLowerCase());
    });
    return q;
  }

  function formatCard(card) {
    const body = [
      `【${card.category}】${card.title}`,
      card.answer,
      '',
      ...card.steps.map((s, idx) => `${idx + 1}. ${s}`),
    ].join('\n');
    return {
      text: body,
      personalHook: card.personalHook || null,
      followUps: card.followUps || [],
    };
  }

  // 主查詢函式：回傳標準化訊息物件，不呼叫任何外部 API
  function queryLocal(inputText, getCtx) {
    const raw = String(inputText || '').trim();
    if (trees[raw]) {
      const tr = trees[raw];
      return {
        text: tr.prompt,
        options: tr.options,
        followUps: topics.map((t) => t.label),
      };
    }

    const byId = cards.find((c) => c.id === raw || c.title === raw);
    if (byId) return formatCard(byId);

    const norm = normalizeQuery(raw);
    let bestCard = null;
    let bestScore = 0;

    for (const card of cards) {
      let score = 0;
      for (const kw of card.keywords) {
        const k = kw.toLowerCase();
        if (norm.includes(k)) score += k.length >= 2 ? 3 : 2;
      }
      if (norm.includes(card.category.toLowerCase())) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    if (bestCard && bestScore >= 2) {
      return formatCard(bestCard);
    }

    return {
      text: '免 API 問答小幫手可以回答減脂、健康飲食、動態生活、重訓與有氧問題。你可以直接點下方主題，或換個關鍵字問我（例如：超商、蛋白質、重訓、有氧、步數、嘴饞、卡關）：',
      options: topics.map((t) => ({ label: t.label, nextTree: t.id })),
      followUps: ['超商／便當外食怎麼配', '重訓跟有氧誰先做？', '沒空去健身房怎麼多動'],
    };
  }

  const isApplyAffirmative = (txt) => /^(要|好|套用|可以|嗯|ok|yes|算一下|幫我算)/i.test(String(txt || '').trim());
  const isApplyDecline = (txt) => /^(不要|不用|先不用|算了|no)/i.test(String(txt || '').trim());

  window.CoachLocalEngine = {
    topics,
    trees,
    cards,
    queryLocal,
    readPersonalSnapshot,
    buildAskApplyPrompt,
    computeAppliedResult,
    isApplyAffirmative,
    isApplyDecline,
  };
})();
