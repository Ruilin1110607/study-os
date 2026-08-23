const Assessor = (() => {
  const DAY = 86400000;

  function buildDigest(newsEvents, last) {
    const S = Store.state;
    const counts = {};
    newsEvents.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    const tags = {};
    newsEvents.filter(e => e.type === 'mistake').forEach(e => {
      const tg = (e.payload && e.payload.tag) || '?';
      tags[tg] = (tags[tg] || 0) + 1;
    });
    const samples = newsEvents.filter(e => e.type === 'mistake').slice(-3)
      .map(e => { const p = Engine.kp(e.kpId); return p ? p.name : ''; }).filter(Boolean);
    const doneN = S.planItems.filter(i => i.done).length;
    return {
      今天: Engine.today(),
      距上次体检: last ? last.date : '首次体检',
      期间行为统计: counts,
      新错题标签分布: tags,
      新错题知识点样本: samples,
      今日计划完成: doneN + '/' + S.planItems.length,
      本地画像指标: Profiler.forAI(),
      上次体检结论: last
        ? { 状态: last.report.status, 概括: last.report.label, 摘要: last.report.summary }
        : null
    };
  }

  async function maybeRun(force) {
    const S = Store.state;
    if (!AI.ready()) {
      if (force) throw new Error('未配置 API，请先到「设置」填写');
      return false;
    }
    const last = S.assessments[0];
    const news = S.events.filter(e => !last || e.ts > last.ts);
    if (!force) {
      if (last && Date.now() - last.ts < DAY) return false;
      if (news.length < 8) return false;
    }
    const digest = JSON.stringify(buildDigest(news, last));
    const report = await AI.assess(digest);
    S.assessments.unshift({
      id: Store.uid(), ts: Date.now(), date: Engine.today(),
      trigger: force ? 'manual' : 'auto', report
    });
    Profiler.snapshot();
    return true;
  }

  return { maybeRun };
})();
