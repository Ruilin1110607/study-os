const AI = (() => {
  const PRESETS = {
    pollinations: { label: '免费体验（无需 Key，公共接口较慢）', base: 'https://text.pollinations.ai', endpoint: 'https://text.pollinations.ai/openai', model: 'openai', noKey: true },
    deepseek: { label: 'DeepSeek（推荐，便宜）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    zhipu: { label: '智谱 GLM（有免费额度）', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    kimi: { label: 'Moonshot Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    custom: { label: '自定义（任意 OpenAI 兼容接口）', base: '', model: '' }
  };

  const cfg = () => Store.state.api;
  const ready = () => {
    const c = cfg();
    const p = PRESETS[c.preset];
    const needKey = !(p && p.noKey);
    return !!(c.base && c.model && (!needKey || c.key));
  };

  async function chat(messages, opt) {
    opt = opt || {};
    const c = cfg();
    if (!ready()) throw new Error('未配置 API，请到「设置」填写');
    const body = {
      model: c.model,
      messages,
      temperature: typeof opt.temperature === 'number' ? opt.temperature : 0.4
    };
    if (opt.json) body.response_format = { type: 'json_object' };
    if (opt.maxTokens) body.max_tokens = opt.maxTokens;
    const pr = PRESETS[c.preset];
    const url = (pr && pr.endpoint) || c.base.replace(/\/+$/, '') + '/chat/completions';

    async function doFetch(b) {
      const headers = { 'Content-Type': 'application/json' };
      if (c.key) headers.Authorization = 'Bearer ' + c.key;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(b)
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const j = await res.json();
          if (j.error && j.error.message) msg = j.error.message;
        } catch (e) {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
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
      { json: true, maxTokens: 1600 }
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
      { json: true, maxTokens: 900 }
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
      { json: true, maxTokens: 1400 }
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
      { temperature: 0.5, maxTokens: 1400 }
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
    return await chat(msgs, { temperature: 0.6, maxTokens: 900 });
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
      { json: true, temperature: 0.4, maxTokens: 1200 }
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
      { json: true, maxTokens: 2200 }
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
      { json: true, maxTokens: 2400 }
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
      { json: true, temperature: 0.5, maxTokens: 2000 }
    );
    return extractJSON(txt);
  }

  async function test() {
    await chat([{ role: 'user', content: '回复OK' }], { maxTokens: 10 });
  }

  return { PRESETS, ready, chat, genPlan, analyzeMistake, predictRisk, weeklyReport, ask, assess, genKnowledgeMap, parsePlanText, genGrowthPath, test };
})();
