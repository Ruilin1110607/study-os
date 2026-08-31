const Intel = (() => {
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

  function attempts(kpId) {
    return Store.state.attempts.filter(a => a.kpId === kpId);
  }

  function accuracy(p) {
    const A = attempts(p.id);
    if (A.length) {
      const c = A.filter(a => a.isCorrect).length;
      return clamp(c / A.length * 100);
    }
    return null;
  }

  function confidence(p) {
    let score = (p.stage || 0) * 14;
    const logs = Store.state.logs.filter(l => l.kpId === p.id).slice(-6);
    score += logs.filter(l => l.rating === 'good').length * 7;
    const A = attempts(p.id).slice(-8);
    let streak = 0;
    for (let i = A.length - 1; i >= 0; i--) { if (A[i].isCorrect) streak++; else break; }
    score += streak * 5;
    return clamp(score);
  }

  // ---- 纯规则函数：不触碰 Store 与真实时钟，与后端 forgetting_engine/priority_engine 共享 fixture 锁定 ----
  function forgettingRiskRules(p, acc, todayStr) {
    const base = p.lastStudy || p.createdAt;
    const days = base ? Math.max(0, Engine.diffDays(base, todayStr)) : 30;
    const r = Math.min(100, days * 9)
      + (100 - p.mastery) * 0.25
      + (acc == null ? 10 : (100 - acc) * 0.35)
      + Math.min((p.errCount || 0) * 3, 12);
    return clamp(r);
  }

  function forgettingRisk(p) {
    return forgettingRiskRules(p, accuracy(p), Engine.today());
  }

  function riskLevel(r) { return r >= 66 ? 'high' : r >= 33 ? 'mid' : 'low'; }

  function missionRules(p, fr, course, todayStr) {
    const imp = p.importance == null ? 3 : p.importance;
    let urgency = 10;
    if (course && course.examDate) {
      const dd = Engine.diffDays(todayStr, course.examDate);
      if (dd >= 0 && dd <= 45) urgency = clamp(100 - dd * 2);
    }
    const weakness = clamp((100 - p.mastery) * 0.7 + (p.errCount || 0) * 6);
    const score = clamp(Math.round(
      weakness * 0.42 + fr * 0.28 + urgency * 0.22 + (imp / 5) * 100 * 0.08
    ));
    const reasons = [];
    if (p.mastery < 50) reasons.push('掌握度低（' + p.mastery + '%）');
    if (fr >= 66) reasons.push('遗忘风险高');
    else if (fr >= 33) reasons.push('开始遗忘');
    if ((p.errCount || 0) > 0) reasons.push('累计错题 ' + p.errCount + ' 次');
    if (urgency > 60 && course) reasons.push(course.name + ' 考试临近');
    if (imp >= 4) reasons.push('核心知识点');
    if (!reasons.length) reasons.push('巩固保持');
    const recMin = p.mastery < 40 ? 35 : p.mastery < 70 ? 25 : 15;
    const kind = fr >= 66 ? '复习' : '学习';
    return { score, reasons, recMin, kind, risk: fr, level: riskLevel(fr), urgency };
  }

  function mission(p) {
    return missionRules(p, forgettingRisk(p), Engine.course(p.courseId), Engine.today());
  }

  function missions(n) {
    return Store.state.kps
      .map(p => ({ p, m: mission(p) }))
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, n || 5);
  }

  function insights() {
    const out = [];
    const S = Store.state;
    try {
      const due = Engine.dueKps();
      if (due.length >= 3) {
        const od = due.filter(p => Engine.overdueDays(p) > 0).length;
        out.push({
          icon: '📥', act: 'review',
          text: `有 ${due.length} 个知识点到了复习时间${od ? `，其中 ${od} 个已逾期` : ''}。先清一轮复习，比学新内容更划算。`
        });
      }
      const rep = [...S.kps].filter(p => (p.errCount || 0) >= 2).sort((a, b) => b.errCount - a.errCount)[0];
      if (rep) {
        out.push({
          icon: '🔁', act: 'practice', kpId: rep.id,
          text: `「${rep.name}」已累计 ${rep.errCount} 次错误——这可能不是粗心，而是概念没吃透。建议先重读定义，再做几道概念辨析题验证。`
        });
      }
      const top = missions(1)[0];
      if (top && top.m.risk >= 66) {
        out.push({
          icon: '⚠️', act: 'mission',
          text: `「${top.p.name}」遗忘风险已达 ${top.m.risk}/100，再拖大概率要重学。今天花 ${top.m.recMin} 分钟处理它最划算。`
        });
      }
      const st = Engine.stats();
      if (st.streak >= 3) {
        out.push({ icon: '🔥', text: `已经连续学习 ${st.streak} 天了，节奏很好。保持这个强度，本周目标会稳步推进。` });
      }
      if (typeof Profiler !== 'undefined') {
        const m = Profiler.compute();
        if (m && m.balance < 40) {
          out.push({ icon: '⚖️', text: `学习时间在各科之间分配失衡（均衡度 ${m.balance}/100）。离考试越近的科目，越应该拿到更多时间。` });
        }
      }
    } catch (e) {}
    return out.slice(0, 3);
  }

  function errorIntel() {
    const S = Store.state;
    const tagCount = {};
    S.mistakes.forEach(m => { tagCount[m.tag] = (tagCount[m.tag] || 0) + 1; });
    S.attempts.forEach(a => {
      if (!a.isCorrect && a.errorType) tagCount[a.errorType] = (tagCount[a.errorType] || 0) + 1;
    });
    const total = Object.values(tagCount).reduce((a, b) => a + b, 0);
    const dist = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count, pct: total ? Math.round(count / total * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    const weak = [...S.kps]
      .filter(p => (p.errCount || 0) > 0)
      .sort((a, b) => mission(b).score - mission(a).score)
      .slice(0, 3)
      .map(p => ({
        name: (Engine.courseName(p.courseId) ? Engine.courseName(p.courseId) + ' · ' : '') + p.name,
        err: p.errCount,
        score: mission(p).score
      }));
    return { total, dist, weak };
  }

  return { accuracy, confidence, forgettingRiskRules, forgettingRisk, riskLevel, missionRules, mission, missions, insights, errorIntel };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Intel;
