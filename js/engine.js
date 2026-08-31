const Engine = (() => {
  const INTERVALS = [1, 2, 4, 7, 15];
  const { today, addDays, diffDays, dstr } = Util;
  const weekday = str => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(str + 'T00:00:00').getDay()];
  const fmtCN = str => {
    const p = str.split('-');
    return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  };

  const S = () => Store.state;
  const course = id => S().courses.find(c => c.id === id);
  const kp = id => S().kps.find(k => k.id === id);
  const courseName = id => { const c = course(id); return c ? c.name : ''; };

  // ---- 纯规则函数：不触碰 Store 与真实时钟，供 node 测试与后端共享 fixture（rules.json）锁定行为 ----
  function checkinRules(p, rating, todayStr) {
    const prev = p.mastery;
    if (rating === 'good') {
      p.mastery = Math.min(100, p.mastery + 10);
      p.stage = Math.min(INTERVALS.length - 1, (p.stage || 0) + 1);
      p.nextReview = addDays(todayStr, INTERVALS[p.stage]);
    } else if (rating === 'ok') {
      p.mastery = Math.min(100, p.mastery + 4);
      p.nextReview = addDays(todayStr, Math.max(1, Math.round(INTERVALS[p.stage || 0] * 0.6)));
    } else {
      p.mastery = Math.max(0, p.mastery - 12);
      p.stage = 0;
      p.nextReview = addDays(todayStr, 1);
    }
    return p.mastery - prev;
  }

  function practiceRules(p, isCorrect, todayStr) {
    const prev = p.mastery;
    p.mastery = Math.max(0, Math.min(100, p.mastery + (isCorrect ? 2 : -5)));
    if (isCorrect && !p.nextReview && p.mastery >= 60) {
      p.stage = Math.max(p.stage || 0, 1);
      p.nextReview = addDays(todayStr, INTERVALS[p.stage]);
    }
    return p.mastery - prev;
  }

  function checkin(kpId, rating, minutes) {
    const p = kp(kpId);
    if (!p) return 0;
    p.lastStudy = today();
    const delta = checkinRules(p, rating, today());
    S().logs.push({ id: Store.uid(), date: today(), ts: Date.now(), kpId, rating, minutes: minutes || 0 });
    Store.logEvent('checkin', kpId, { rating, minutes: minutes || 0, delta });
    return delta;
  }

  function practiceResult(kpId, isCorrect) {
    const p = kp(kpId);
    if (!p) return 0;
    const delta = practiceRules(p, isCorrect, today());
    Store.logEvent('practice', kpId, { isCorrect, delta });
    return delta;
  }

  function addMistake(kpId, tag, desc, analysis) {
    S().mistakes.push({
      id: Store.uid(), kpId, tag: tag || '其他', desc: desc || '',
      date: today(), analysis: analysis || null
    });
    const p = kp(kpId);
    if (!p) return;
    p.errCount++;
    p.errTags[tag] = (p.errTags[tag] || 0) + 1;
    p.mastery = Math.max(0, p.mastery - 8);
    p.stage = 0;
    p.nextReview = addDays(today(), 1);
    Store.logEvent('mistake', kpId, { tag: tag || '其他' });
  }

  function overdueDays(p) {
    return p.nextReview ? Math.max(0, diffDays(p.nextReview, today())) : 0;
  }

  function dueKps() {
    const t = today();
    return S().kps.filter(p => p.nextReview && p.nextReview <= t);
  }

  function weakness(p) {
    let s = (100 - p.mastery) * 0.6 + Math.min(p.errCount * 8, 24) + overdueDays(p) * 3;
    const c = course(p.courseId);
    if (c && c.examDate) {
      const dd = diffDays(today(), c.examDate);
      if (dd >= 0 && dd <= 21) s += 21 - dd;
    }
    return s;
  }

  function weakReason(p) {
    const bits = [];
    if (p.errCount > 0) bits.push('累计错题 ' + p.errCount + ' 次');
    if (overdueDays(p) > 0) bits.push('复习已逾期 ' + overdueDays(p) + ' 天');
    if (p.mastery < 45) bits.push('掌握度偏低');
    return bits.join('、') || '巩固提升';
  }

  function buildRulePlan() {
    const st = S();
    const budget = st.profile.dailyMinutes || 120;
    const items = [];
    let used = 0;
    const ranked = (typeof Intel !== 'undefined') ? Intel.missions(12) : [];
    ranked.forEach(({ p, m }) => {
      if (used >= budget) return;
      const min = Math.max(10, Math.min(m.recMin, budget - used));
      items.push({
        id: Store.uid(), kpId: p.id,
        title: courseName(p.courseId) + ' · ' + p.name,
        minutes: min,
        tag: m.kind === '复习' ? '到期复习' : '薄弱推进',
        reason: '优先级 ' + m.score + '：' + m.reasons.join('、'),
        done: false, source: 'rule'
      });
      used += min;
    });
    st.planItems = items;
    st.planDate = today();
    st.planNote = '由 Learning Intelligence 生成：按 掌握度 × 遗忘风险 × 考试紧迫 × 重要度 综合排序。配置 AI 后可获得更个性化的规划。';
    st.planGenTs = Date.now();
    Store.logEvent('plan_generate', '', { source: 'rule', count: items.length });
  }

  function applyPlan(obj, source) {
    const st = S();
    const validIds = new Set(st.kps.map(p => p.id));
    st.planItems = (obj.items || []).map(it => ({
      id: Store.uid(),
      kpId: it.kpId && validIds.has(it.kpId) ? it.kpId : '',
      title: it.title || '学习任务',
      minutes: Math.max(5, Math.min(120, Number(it.minutes) || 25)),
      tag: it.tag || '薄弱推进',
      reason: it.reason || '',
      done: false,
      source
    }));
    st.planDate = today();
    st.planNote = obj.note || '';
    st.planGenTs = Date.now();
    Store.logEvent('plan_generate', '', { source, count: st.planItems.length });
  }

  function stats() {
    const st = S();
    const byDay = {};
    st.logs.forEach(l => { byDay[l.date] = (byDay[l.date] || 0) + (l.minutes || 0); });
    const t = today();
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const m = byDay[addDays(t, -i)] || 0;
      if (m > 0) streak++;
      else { if (i === 0) continue; break; }
    }
    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i);
      trend.push({ date: d, minutes: byDay[d] || 0 });
    }
    const totalMin = Object.values(byDay).reduce((a, b) => a + b, 0);
    const courseStats = st.courses.map(c => {
      const ks = st.kps.filter(p => p.courseId === c.id);
      return {
        c, count: ks.length,
        avg: ks.length ? Math.round(ks.reduce((x, p) => x + p.mastery, 0) / ks.length) : 0
      };
    });
    const bottlenecks = [...st.kps]
      .sort((a, b) => weakness(b) - weakness(a))
      .slice(0, 3)
      .map(p => ({ p, c: course(p.courseId), why: weakReason(p) }));
    return {
      streak,
      trend,
      weekMin: trend.slice(7).reduce((a, d) => a + d.minutes, 0),
      totalHours: Math.round(totalMin / 60 * 10) / 10,
      courseStats,
      bottlenecks,
      due: dueKps().length
    };
  }

  return {
    INTERVALS, today, addDays, diffDays, dstr, weekday, fmtCN,
    course, kp, courseName,
    checkinRules, practiceRules, checkin, addMistake, practiceResult,
    dueKps, overdueDays, weakness, weakReason,
    buildRulePlan, applyPlan, stats
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
