// 控制器级动作（原 app.js doGen/toggleItem/diag/reviewTomorrow/weekly/risk/配置保存测试，忠实搬移）
const Actions = (() => {
  const { $, toast, guardAI, flags } = UI;

  async function doGen(constraint) {
    if (flags.gen) return;
    flags.gen = true;
    try {
      if (!AI.ready()) {
        Engine.buildRulePlan();
        Store.save();
        toast('未接入 AI，已按规则生成。在设置中配置 API Key 可解锁智能规划');
      } else {
        toast(constraint ? '正在按你的情况重新规划…' : '正在生成今日计划…');
        const plan = await AI.genPlan(constraint || '');
        Engine.applyPlan(plan, 'ai');
        Store.save();
        toast('今日计划已生成', 'success');
      }
    } catch (e) {
      toast('AI 生成失败：' + e.message + '，已回退规则引擎', 'error');
      Engine.buildRulePlan();
      Store.save();
    } finally {
      flags.gen = false;
    }
  }

  function toggleItem(id) {
    const it = Store.state.planItems.find(i => i.id === id);
    if (!it) return;
    if (!it.done && it.kpId) { Modals.openCheckin({ itemId: id, kpId: it.kpId }); return; }
    it.done = !it.done;
    Store.logEvent('task_done', it.kpId || '', { title: it.title });
    Store.save();
  }

  async function diag(id) {
    const m = Store.state.mistakes.find(x => x.id === id);
    if (!m || flags.ai) return;
    if (!guardAI()) return;
    flags.ai = true;
    toast('AI 正在分析这道错题…');
    try {
      const r = await AI.analyzeMistake(m);
      m.analysis = { reason: r.reason || '', gap: r.gap || '', advice: r.advice || '', severity: r.severity || '' };
      Store.save();
      toast('诊断完成', 'success');
    } catch (e) {
      toast('诊断失败：' + e.message, 'error');
    } finally { flags.ai = false; }
  }

  function reviewTomorrow(id) {
    const m = Store.state.mistakes.find(x => x.id === id);
    if (!m) return;
    const p = Engine.kp(m.kpId);
    if (p) { p.stage = 0; p.nextReview = Engine.addDays(Engine.today(), 1); }
    Store.save();
    toast('已加入明天的复习队列', 'success');
  }

  async function weekly() {
    if (flags.ai || !guardAI()) return;
    flags.ai = true;
    toast('AI 正在撰写本周报告…');
    try {
      const md = await AI.weeklyReport();
      Store.state.reports.unshift({ id: Store.uid(), type: 'weekly', title: '本周学习报告', content: md, date: Engine.today() });
      Store.save();
      toast('报告已生成', 'success');
    } catch (e) {
      toast('失败：' + e.message, 'error');
    } finally { flags.ai = false; }
  }

  async function risk() {
    if (flags.ai || !guardAI()) return;
    flags.ai = true;
    toast('AI 正在评估考试风险…');
    try {
      const risks = await AI.predictRisk();
      Store.state.reports.unshift({
        id: Store.uid(), type: 'risk', title: '考试风险预测',
        content: JSON.stringify(risks), date: Engine.today()
      });
      Store.save();
      toast('预测完成', 'success');
    } catch (e) {
      toast('失败：' + e.message, 'error');
    } finally { flags.ai = false; }
  }

  // 读取设置页表单并按模式持久化：云模式走 /api/ai/config（Key 不落浏览器、不随整包同步），本机模式存 localStorage
  async function saveApiConfig() {
    const api = Store.state.api;
    api.base = $('#f-base').value.trim();
    api.model = $('#f-model').value.trim();
    const keyVal = $('#f-key').value.trim();
    if (Store.transport === 'api') {
      const body = { preset: api.preset || '', base: api.base, model: api.model };
      if (keyVal) body.key = keyVal;
      const r = await Store.apiFetch('/api/ai/config', { method: 'POST', body });
      api.keySet = !!r.hasKey;
      AI.setServerReady(r.configured);
    } else {
      api.key = keyVal;
      try { localStorage.setItem('study_os_v1', JSON.stringify(Store.state)); } catch (e) {}
    }
    return keyVal;
  }

  async function testApi() {
    try { await saveApiConfig(); }
    catch (e) { toast('保存失败：' + e.message, 'error'); return; }
    toast('测试连接中…');
    try {
      await AI.test();
      toast('连接成功，配置有效', 'success');
      App.render();
    } catch (e) {
      toast('连接失败：' + e.message, 'error');
    }
  }

  return { doGen, toggleItem, diag, reviewTomorrow, weekly, risk, saveApiConfig, testApi };
})();
