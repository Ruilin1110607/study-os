const AI = (() => {
  const PRESETS = {
    gemini: { label: 'Google Gemini（免费额度大 · 推荐）', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', keyUrl: 'https://aistudio.google.com/apikey' },
    deepseek: { label: 'DeepSeek（便宜稳定）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
    zhipu: { label: '智谱 GLM（有免费模型）', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
    kimi: { label: 'Moonshot Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
    custom: { label: '自定义（任意 OpenAI 兼容接口）', base: '', model: '' }
  };

  const cfg = () => Store.state.api;
  const ready = () => {
    const c = cfg();
    return !!(c.base && c.model && c.key);
  };

  async function chat(messages, opt) {
    opt = opt || {};
    if (!ready()) throw new Error('未配置 AI：请到「设置」选择服务商并填写 API Key');
    const c = cfg();
    const temperature = typeof opt.temperature === 'number' ? opt.temperature : 0.4;
    const maxTokens = opt.maxTokens || undefined;

    // B3：云模式下走服务端代理，Key 不经过浏览器直连
    if (typeof Store !== 'undefined' && Store.transport === 'api') {
      const r = await Store.apiFetch('/api/ai/chat', {
        method: 'POST',
        body: { messages, temperature, max_tokens: maxTokens, json_mode: !!opt.json }
      });
      return r.content;
    }

    const body = { model: c.model, messages, temperature };
    if (opt.json) body.response_format = { type: 'json_object' };
    if (opt.maxTokens) body.max_tokens = opt.maxTokens;
    // 智谱 GLM-4.5/4.6 系列默认深度思考，出题等结构化任务关闭后速度提升约 3 倍
    if (/glm-4\.[56]/i.test(c.model || '')) body.thinking = { type: 'disabled' };
    const pr = PRESETS[c.preset];
    const url = (pr && pr.endpoint) || c.base.replace(/\/+$/, '') + '/chat/completions';

    async function doFetch(b) {
      const headers = { 'Content-Type': 'application/json' };
      if (c.key) headers.Authorization = 'Bearer ' + c.key;
      const ctrl = ('AbortController' in window) ? new AbortController() : null;
      const limit = opt.timeout || 120000;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), limit) : null;
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(b),
          signal: ctrl ? ctrl.signal : undefined
        });
      } catch (err) {
        if (timer) clearTimeout(timer);
        if (ctrl && err.name === 'AbortError') throw new Error('请求超时（' + Math.round(limit / 1000) + ' 秒），请重试或换服务商');
        throw new Error('网络请求失败：请检查网络或该接口是否允许浏览器跨域调用');
      }
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const j = await res.json();
          if (j.error && j.error.message) msg = j.error.message;
        } catch (e) {}
        if (res.status === 401 || res.status === 403) msg = '鉴权失败：请检查 API Key 是否正确（' + msg + '）';
        else if (res.status === 402) msg = '额度不足或通道已停用：请更换服务商（' + msg + '）';
        else if (res.status === 429) msg = '请求过快或额度耗尽：稍后再试（' + msg + '）';
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
      const content = msg.content || '';
      if (!content) {
        if (msg.reasoning_content) throw new Error('该模型是推理模型，思考耗尽了输出上限且未产出正文。建议在设置中换用非推理模型（如 glm-4-flash）后重试');
        throw new Error('服务商返回了空内容');
      }
      return content;
    }

    try {
      return await doFetch(body);
    } catch (e) {
      if (opt.json && e.status === 400) {
        delete body.response_format;
        return await doFetch(body);
      }
      throw e;
    }
  }

  function extractJSON(text) {
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const si = t.search(/[{[]/);
    if (si < 0) throw new Error('返回内容中未找到 JSON');
    const open = t[si];
    const close = open === '{' ? '}' : ']';
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = si; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) end = t.length;
    return JSON.parse(t.slice(si, end + 1));
  }

  function ctxSummary() {
    const st = Store.state;
    const s = Engine.stats();
    return JSON.stringify({
      学生: { 昵称: st.profile.name, 专业: st.profile.major, 目标: st.profile.goal },
      今天: Engine.today(),
      连续学习天数: s.streak,
      近7天每日学习分钟: s.trend.slice(7).map(d => d.minutes),
      课程: st.courses.map(c => ({ id: c.id, 名称: c.name, 考试日期: c.examDate || null })),
      知识点: st.kps.map(p => ({
        id: p.id,
        课程: Engine.courseName(p.courseId),
        章节: p.chapter,
        名称: p.name,
        掌握度: p.mastery,
        错题数: p.errCount,
        下次复习日: p.nextReview
      })),
      画像指标: (typeof Profiler !== 'undefined') ? Profiler.forAI() : null,
      成长目标: (st.growthPath && st.growthPath.goal) || null,
      本周重点: (st.growthPath && st.growthPath.weeklyFocus) || null
    });
  }

  async function genPlan(constraint) {
    const sys = [
      '你是「学习OS」的规划引擎。根据学生的知识点掌握数据，为今天生成一份可执行的学习清单。',
      '要求：',
      '1)优先安排到期复习的知识点(下次复习日<=今天)；',
      '2)兼顾薄弱点(掌握度低、错题多)与临近考试的课程；',
      '3)每个任务15~45分钟，总时长不超过今日可用时间；',
      '4)每项给一句安排理由；任务名格式「课程 · 知识点」。',
      '5)若数据中给出"本周重点"，优先围绕它安排任务；',
      '只输出JSON：{"note":"一句话总体建议","items":[{"title":"课程 · 知识点","kpId":"使用提供的知识点id，无对应则为空字符串","minutes":25,"tag":"到期复习/薄弱推进/新学/练习","reason":"为什么今天安排"}]}'
    ].join('\n');
    const user = '学生数据：' + ctxSummary()
      + '\n今日可用时间：' + (Store.state.profile.dailyMinutes || 120) + ' 分钟'
      + (constraint ? '\n额外约束：' + constraint : '')
      + '\n请生成今天的计划。';
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, maxTokens: 3200 }
    );
    const obj = extractJSON(txt);
    const raw = Array.isArray(obj) ? obj : (obj.items || []);
    return {
      note: obj.note || '',
      items: raw.map(it => ({
        title: it.title || '学习任务',
        kpId: it.kpId || '',
        minutes: Math.max(5, Math.min(120, Number(it.minutes) || 25)),
        tag: it.tag || '薄弱推进',
        reason: it.reason || ''
      }))
    };
  }

  async function analyzeMistake(m) {
    const p = Engine.kp(m.kpId);
    const parts = p ? [Engine.courseName(p.courseId), p.chapter, p.name].filter(Boolean) : [];
    const sys = [
      '你是学习诊断引擎。分析学生的错题，定位根因并给出可执行的补救方案。',
      '只输出JSON：{"reason":"根因定位：这道题为什么错，一两句","gap":"概念缺口：背后没掌握的知识点是什么","advice":"补救建议：先看什么再练什么，具体到步骤","severity":"高/中/低"}'
    ].join('\n');
    const user = '知识点：' + (parts.join(' / ') || '未知')
      + '\n历史错误次数：' + (p ? p.errCount : '?')
      + '\n当前掌握度：' + (p ? p.mastery : '?') + '%'
      + '\n自选错因标签：' + m.tag
      + '\n错题描述：' + (m.desc || '无');
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, maxTokens: 4200 }
    );
    return extractJSON(txt);
  }

  async function predictRisk() {
    const cs = Store.state.courses.filter(c => c.examDate);
    if (!cs.length) throw new Error('没有设置考试日期的课程，请先在知识树中给课程填上考试日期');
    const sys = [
      '你是学业风险预测引擎。基于各课程知识点掌握度、错题分布与考试倒计时，评估期末通过风险。',
      '只输出JSON：{"risks":[{"courseId":"课程id","daysLeft":距考试天数,"probability":0到100的通过概率整数,"level":"良好/注意/警告","bottleneck":["主要风险点1","风险点2"],"advice":"冲刺建议一两句","minutesPerDay":建议每日投入分钟数}]}',
      '每个设置了考试日期的课程都必须给出评估。概率要参考平均掌握度和错题集中度，不要拍脑袋。'
    ].join('\n');
    const user = '今天：' + Engine.today() + '\n学生数据：' + ctxSummary();
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, maxTokens: 3000 }
    );
    const obj = extractJSON(txt);
    return obj.risks || [];
  }

  async function weeklyReport() {
    const sys = [
      '你是学习状态解读引擎。用简洁中文 Markdown 输出本周学习报告。',
      '结构：整体概览 / 进步亮点 / 瓶颈诊断(指出具体知识点与原因) / 下周建议(不超过3条)。',
      '直接输出内容，不要寒暄，引用具体数据支撑判断。'
    ].join('\n');
    const user = '今天：' + Engine.today() + '\n学生数据：' + ctxSummary();
    return await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { temperature: 0.5, maxTokens: 3000 }
    );
  }

  async function ask(q) {
    const sys = [
      '你是「Study Agent」，学生的学习决策助手。',
      '你能看到学生的全部学习数据(知识点掌握度、错题记录、复习排期、考试倒计时)。',
      '回答要求：简洁直接、有依据(引用具体数据)。如果用户表达时间或精力受限(如"只有1小时""有点累")，主动按剩余时间给出精简安排。',
      '用中文回答，控制在300字以内。'
    ].join('\n');
    const hist = Store.state.chat.slice(-10).map(m => ({ role: m.role, content: m.content }));
    while (hist.length && hist[hist.length - 1].role === 'user' && hist[hist.length - 1].content === q) hist.pop();
    const msgs = [{ role: 'system', content: sys + '\n当前学生数据：' + ctxSummary() }]
      .concat(hist, [{ role: 'user', content: q }]);
    return await chat(msgs, { temperature: 0.6, maxTokens: 4200 });
  }

  async function assess(digestJSON) {
    const sys = [
      '你是「学习OS」的后台学习体检引擎。学生打开网页时你会被静默调用，基于本地画像指标与近期行为数据做一次全面体检。',
      '要求：',
      '- 结论必须引用具体数据（如"逾期复习5项""连续学习3天"），禁止空泛评价；',
      '- 发现问题要给出证据与可执行建议；有进步也要点出亮点；',
      '- 若认为当前每日计划需要调整，adjustPlan 设为 true 并在 adjustReason 说明方向。',
      '只输出JSON：{"status":"优秀/良好/一般/需警惕","label":"不超过15字的状态概括","summary":"三句话以内的诊断","findings":[{"type":"拖延/失衡/错误模式/进步亮点/其他","evidence":"数据证据","advice":"一句话建议"}],"adjustPlan":true或false,"adjustReason":"方向说明"}'
    ].join('\n');
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: '体检数据：' + digestJSON }],
      { json: true, temperature: 0.4, maxTokens: 2600 }
    );
    return extractJSON(txt);
  }

  async function genKnowledgeMap(major, grade, extra) {
    const sys = [
      '你是专业知识地图生成引擎。根据专业与年级生成典型培养方案知识结构。',
      '约束：3~5个方向，每个方向2~4门核心课，每门课4~6个章节；使用中国大学真实课程名；不要体育、思政等通识课。',
      extra ? ('补充要求：' + extra) : '',
      '只输出JSON：{"major":"专业名","directions":[{"name":"方向名","courses":[{"name":"课程名","chapters":["章节1","章节2"]}]}]}'
    ].filter(Boolean).join('\n');
    const user = `专业：${major}；年级：${grade || '大一'}。请生成知识地图。`;
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, maxTokens: 4200 }
    );
    return extractJSON(txt);
  }

  async function parsePlanText(text, majorLabel) {
    const sys = [
      '你是培养方案解析引擎。从粘贴的培养方案/课程大纲文本中提取课程与章节结构。',
      '忽略公共选修、体育、军训等；主干专业课拆到章节级；不确定的内容宁缺勿猜。',
      '只输出JSON：{"major":"专业或方案名","directions":[{"name":"方向","courses":[{"name":"课程","chapters":["章节"]}]}]}'
    ].join('\n');
    const user = `方案文本（可能截断）：\n${String(text).slice(0, 6000)}\n\n${majorLabel ? '标注专业：' + majorLabel : ''}\n请解析。`;
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, maxTokens: 4400 }
    );
    return extractJSON(txt);
  }

  async function genGrowthPath(goal, horizon) {
    const sys = [
      '你是成长路径规划引擎。结合学生的长期目标、各科掌握度与画像指标，倒推阶段里程碑。',
      '要求：',
      '- abilities 必须引用学生真实存在的课程/知识点，current 用真实掌握度，required 给该阶段应达到的水平；',
      '- gap 一句话说明差距；actions 给具体可执行行动；',
      '- weeklyFocus 是未来两周重点（不超过4条），会被每日规划引擎参考。',
      '只输出JSON：{"summary":"路径总述一两句","milestones":[{"phase":"阶段名","target":"阶段目标","abilities":[{"name":"课程 · 知识点","current":35,"required":75,"gap":"差距说明"}],"actions":["行动1"]}],"weeklyFocus":["重点1"]}'
    ].join('\n');
    const user = `长期目标：${goal}\n时间跨度：${horizon}\n学生数据：${ctxSummary()}`;
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, temperature: 0.5, maxTokens: 4000 }
    );
    return extractJSON(txt);
  }

  async function genQuestions(kpId, count, difficulty) {
    const p = Engine.kp(kpId);
    if (!p) throw new Error('知识点不存在');
    const parts = [Engine.courseName(p.courseId), p.chapter, p.name].filter(Boolean);
    const sys = [
      '你是大学课程出题引擎。针对指定知识点出高质量的单选题，用于主动回忆练习。',
      '要求：',
      '- 题目考查核心概念的理解与应用，不要死记硬背型题目；',
      `- 难度定位：${difficulty || '进阶'}（基础=概念辨析，进阶=理解应用，挑战=综合推理）；`,
      '- 4 个选项中只有 1 个正确；干扰项要有迷惑性（常见误解）；',
      '- explain 用两三句话讲透为什么，点出错误选项错在哪。'
    ].join('\n');
    const user = `知识点：${parts.join(' / ')}\n学生当前掌握度：${p.mastery}%，历史错题 ${p.errCount} 次\n请出 ${count || 3} 道题。`;
    const txt = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { json: true, temperature: 0.6, maxTokens: 3600 }
    );
    const obj = extractJSON(txt);
    const raw = Array.isArray(obj) ? obj : (obj.questions || []);
    return raw.map(q => ({
      stem: q.stem || q.question || '',
      options: (q.options || []).map(String),
      answer: Math.max(0, Math.min(3, Number(q.answer) || 0)),
      explain: q.explain || ''
    })).filter(q => q.stem && q.options.length >= 2);
  }

  function findKp(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    const kps = Store.state.kps;
    let best = null, bestScore = 0;
    kps.forEach(p => {
      const name = (p.name || '').toLowerCase();
      const chapter = (p.chapter || '').toLowerCase();
      const course = Engine.courseName(p.courseId).toLowerCase();
      let s = 0;
      if (name === q) s = 100;
      else if (name.includes(q)) s = 80 - Math.min(name.length - q.length, 20);
      else if (chapter.includes(q)) s = 55;
      else if (course.includes(q)) s = 30;
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return bestScore >= 25 ? best : null;
  }

  async function agentAct(userText) {
    const sys = [
      '你是 StudyOS 的学习 Agent，能读取学生的全部学习数据，并对其学习系统执行操作。',
      '你可以使用以下工具（所有写操作都以 actions 返回，用户确认后才会真正执行）：',
      '1. create_tasks —— 创建今日学习任务。参数 items:[{"title":"任务名","kpId":"知识点id或空","minutes":25,"tag":"到期复习/薄弱推进/新学/练习/事务","reason":"理由"}]',
      '2. replan_today —— 按约束重排今日计划。参数 {"constraint":"约束文本"}',
      '3. generate_practice —— 为知识点生成练习题并开始练习。参数 {"kpId":"知识点id","count":3,"difficulty":"基础/进阶/挑战"}',
      '4. add_review_tomorrow —— 把知识点加入明天复习队列。参数 {"kpId":"知识点id"}',
      '5. plan_days —— 多日学习计划（用户说"未来N天/每天只有X小时/几天后考试"时使用）。参数 {"days":[{"date":"YYYY-MM-DD","items":[{"title":"任务名","kpId":"id或空","minutes":30,"tag":"薄弱推进/到期复习/新学/练习/事务","reason":"理由"}]}]}，日期从明天开始连续排列，总时长不超过用户每日可用时间。',
      '要求：',
      '- 覆盖规则（最高优先级）：用户提到的每一件事都必须出现在 items 里，禁止遗漏、合并或自行筛选：',
      '  · 非知识点类事务（预约、办事、上课、休息等）→ kpId 置空、tag 用「事务」、时长合理估计；',
      '  · 用户提到数据里不存在的课程/知识点 → 照样创建任务，kpId 置空，标题用用户说的名称；',
      '- 先判断用户意图，再决定回复方式：',
      '  · 提问/求解释（为什么/是什么/怎么办/哪个更值得）：直接回答问题本身，给出基于数据的解释和推理，actions 留空数组。禁止以"我将为您…"开头，禁止把回答变成执行动作的宣告；',
      '  · 只有用户明确要求改动（重排计划/创建任务/出题/加入复习）时，才返回对应 actions，并在 reply 里说明你准备做什么，等待确认；',
      '- 回复必须基于学生真实数据下结论，引用具体数字；',
      '- kpId 必须来自学生数据中的 id；用户提到知识点名称时自行匹配，匹配不到就置空而不是丢弃任务；',
      '- 需要多个动作时按执行顺序放入 actions；',
      '- 示例：用户问"为什么专注薄弱环节能提高效率"，正确回复类似 {"reply":"从你的数据看，薄弱知识点掌握度多在40%~50%，而已掌握90%的内容重做收益接近零。学习收益边际递减：同样35分钟，把掌握度40%提到70%带来的提分空间，远大于把90%提到95%。所以优先补弱项性价比最高。","actions":[]}；错误回复是"为了提高效率，我将为您创建一个学习任务"。',
      '只输出JSON：{"reply":"给用户的回复","actions":[{"type":"工具名","...对应参数"}]}'
    ].join('\n');
    const hist = Store.state.chat.slice(-10)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));
    while (hist.length && hist[hist.length - 1].role === 'user' && hist[hist.length - 1].content === userText) hist.pop();
    const msgs = [{ role: 'system', content: sys + '\n当前学生数据：' + ctxSummary() }]
      .concat(hist, [{ role: 'user', content: userText }]);
    const txt = await chat(msgs, { temperature: 0.4, maxTokens: 2800 });
    try {
      const obj = extractJSON(txt);
      return {
        reply: obj.reply || String(txt),
        actions: Array.isArray(obj.actions) ? obj.actions.filter(a => a && typeof a.type === 'string') : []
      };
    } catch (e) {
      return { reply: String(txt), actions: [] };
    }
  }

  async function test() {
    await chat([{ role: 'user', content: '回复OK' }], { maxTokens: 10 });
  }

  return { PRESETS, ready, chat, genPlan, analyzeMistake, predictRisk, weeklyReport, ask, assess, genKnowledgeMap, parsePlanText, genGrowthPath, genQuestions, findKp, agentAct, test };
})();
