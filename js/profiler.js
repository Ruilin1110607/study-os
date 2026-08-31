const Profiler = (() => {
  const DAY_MS = 86400000;
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (str, n) => {
    const d = new Date(str + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return dstr(d);
  };

  function compute() {
    const S = Store.state;
    const t = Engine.today();
    const st = Engine.stats();
    if (!S.kps.length && !S.logs.length && !S.events.length) return null;

    let overdueSum = 0;
    Engine.dueKps().forEach(p => overdueSum += Math.min(Engine.overdueDays(p), 5));
    const doneItems = S.planItems.filter(i => i.done).length;
    const totalItems = S.planItems.length;
    const active14 = st.trend.filter(d => d.minutes > 0).length;

    let consistency = active14 / 14 * 60 + Math.min(st.streak, 7) / 7 * 40;
    if (totalItems) consistency = consistency * 0.7 + (doneItems / totalItems) * 100 * 0.3;
    consistency -= Math.min(20, overdueSum * 2);

    const cut = Date.now() - 14 * DAY_MS;
    let delta = 0;
    S.events.forEach(e => {
      if (e.ts >= cut && e.type === 'checkin') delta += (e.payload && e.payload.delta) || 0;
    });
    const mins14 = st.trend.reduce((a, d) => a + d.minutes, 0);
    const gainPerH = mins14 > 60 ? delta / (mins14 / 60) : null;
    const efficiency = gainPerH == null ? 55 : clamp(gainPerH * 22);

    const withErr = S.kps.filter(p => p.errCount > 0);
    const repRate = withErr.length ? withErr.filter(p => p.errCount >= 2).length / withErr.length : 0;
    const errorPattern = withErr.length
      ? clamp(100 - repRate * 80 - Math.min(withErr.length, 8) * 2)
      : 75;

    const from = addDays(t, -13);
    const timeByCourse = {};
    S.logs.forEach(l => {
      if (l.date < from) return;
      const p = Engine.kp(l.kpId);
      if (!p) return;
      timeByCourse[p.courseId] = (timeByCourse[p.courseId] || 0) + (l.minutes || 0);
    });
    const cs = S.courses.map(c => {
      const dd = c.examDate ? Engine.diffDays(t, c.examDate) : -1;
      const urg = dd >= 0 && dd <= 60 ? (60 - dd) : 10;
      return { m: timeByCourse[c.id] || 0, u: urg };
    }).filter(x => x.u > 0);
    let balance = 60;
    if (cs.length >= 2) {
      const totM = cs.reduce((a, x) => a + x.m, 0) || 1;
      const totU = cs.reduce((a, x) => a + x.u, 0) || 1;
      let dev = 0;
      cs.forEach(x => dev += Math.abs(x.m / totM - x.u / totU));
      balance = clamp(100 - dev * 100);
    }

    return { consistency: clamp(consistency), efficiency, errorPattern, balance, active14, gainPerH };
  }

  function forAI() {
    const m = compute();
    if (!m) return null;
    const S = Store.state;
    return {
      四维指标: {
        一致性: m.consistency,
        效率: m.efficiency,
        纠错力: m.errorPattern,
        科目均衡: m.balance
      },
      近14天活跃天数: m.active14,
      效率说明: m.gainPerH != null ? '每小时掌握度 +' + m.gainPerH.toFixed(1) : '学习时长数据不足',
      今日任务完成: S.planItems.filter(i => i.done).length + '/' + S.planItems.length,
      到期待复习项: Engine.dueKps().length
    };
  }

  function snapshot() {
    const S = Store.state;
    const t = Engine.today();
    const m = compute();
    if (!m) return;
    S.profileSnapshots = S.profileSnapshots.filter(x => x.date !== t);
    S.profileSnapshots.push({
      date: t,
      metrics: {
        consistency: m.consistency, efficiency: m.efficiency,
        errorPattern: m.errorPattern, balance: m.balance
      }
    });
  }

  function latest() {
    const s = Store.state.profileSnapshots;
    return s.length ? s[s.length - 1] : null;
  }

  return { compute, forAI, snapshot, latest };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Profiler;
