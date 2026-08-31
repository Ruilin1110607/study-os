// 学习数据视图（原 app.js vData/riskCard/trendDays/svgLineChart/svgDonut/kpChanges，忠实搬移）
const ViewsData = (() => {
  const { esc, mdToHtml } = UI;
  let dataRange = 7;

  function riskCard(r) {
    const c = Engine.course(r.courseId);
    const name = c ? c.name : (r.course || '');
    const prob = Math.max(0, Math.min(100, Number(r.probability) || 0));
    const lv = r.level === '良好' ? 'good' : r.level === '警告' ? 'bad' : 'mid';
    const lvTag = lv === 'good' ? 'green' : lv === 'bad' ? 'red' : 'amber';
    return `
    <div class="risk-card">
      <h4>${esc(name)} <span class="tag ${lvTag}">${esc(r.level || '')}</span></h4>
      <div class="prob"><i class="lv-${lv}" style="width:${prob}%"></i></div>
      <div class="sm muted">
        预计通过概率 ${prob}%
        ${r.daysLeft != null ? ' · 距考试 ' + r.daysLeft + ' 天' : ''}
        ${r.minutesPerDay ? ' · 建议每日投入 ' + r.minutesPerDay + ' 分钟' : ''}
      </div>
      ${(r.bottleneck && r.bottleneck.length) ? `<div class="sm" style="margin-top:6px"><b>主要风险：</b>${r.bottleneck.map(x => esc(x)).join('、')}</div>` : ''}
      ${r.advice ? `<div class="sm" style="margin-top:6px">${esc(r.advice)}</div>` : ''}
    </div>`;
  }

  function trendDays(n) {
    const S = Store.state;
    const byDay = {};
    S.logs.forEach(l => { if (l.date) byDay[l.date] = (byDay[l.date] || 0) + (l.minutes || 0); });
    const t = Engine.today();
    const rows = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = Engine.addDays(t, -i);
      rows.push({ d, v: byDay[d] || 0 });
    }
    return rows;
  }

  function svgLineChart(rows) {
    const w = 640, h = 170, padL = 34, padR = 10, padT = 12, padB = 22;
    const max = Math.max(30, ...rows.map(r => r.v));
    const n = rows.length;
    const x = i => padL + (w - padL - padR) * (n === 1 ? 0 : i / (n - 1));
    const y = v => padT + (h - padT - padB) * (1 - v / max);
    const pts = rows.map((r, i) => x(i).toFixed(1) + ',' + y(r.v).toFixed(1)).join(' ');
    const area = `${padL},${y(0).toFixed(1)} ${pts} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}`;
    const grid = [max, max / 2].map(g =>
      `<line x1="${padL}" y1="${y(g)}" x2="${w - padR}" y2="${y(g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${padL-5}" y="${y(g)+3.5}" text-anchor="end" class="lc-y">${Math.round(g)}</text>`).join('');
    const lblEvery = Math.max(1, Math.ceil(n / 7));
    const labels = rows.map((r, i) => (i % lblEvery === 0 || i === n - 1)
      ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" class="lc-x">${parseInt(r.d.split('-')[2], 10)}日</text>` : '').join('');
    const dots = rows.map((r, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="2.6" fill="var(--brand)"><title>${r.d} · ${r.v} 分钟</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="lchart" role="img">
      ${grid}
      <polygon points="${area}" fill="var(--brand)" opacity=".08"/>
      <polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>
      ${dots}${labels}</svg>`;
  }

  function svgDonut(dist) {
    if (!dist.length) return '';
    const colors = ['#4f6bf0', '#e5484d', '#f59e0b', '#8b5cf6', '#10b981', '#0ea5e9', '#69718a'];
    const total = dist.reduce((a, d) => a + d.count, 0);
    const R = 44, C = 2 * Math.PI * R;
    let off = 0;
    const segs = dist.map((d, i) => {
      const len = C * d.count / total;
      const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${colors[i % colors.length]}" stroke-width="15"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
        transform="rotate(-90 60 60)"><title>${esc(d.tag)}：${d.count} 条（${d.pct}%）</title></circle>`;
      off += len;
      return s;
    }).join('');
    return `<div class="donut-wrap">
      <svg viewBox="0 0 120 120" class="donut">${segs}
        <text x="60" y="58" text-anchor="middle" class="dn-num">${total}</text>
        <text x="60" y="73" text-anchor="middle" class="dn-lbl">条记录</text></svg>
      <div class="legend">${dist.map((d, i) =>
        `<span class="lg-item"><i style="background:${colors[i % colors.length]}"></i>${esc(d.tag)}<b>${d.pct}%</b></span>`).join('')}</div>
    </div>`;
  }

  function kpChanges(days) {
    const S = Store.state;
    const cut = Engine.addDays(Engine.today(), -(days - 1));
    const byKp = {};
    S.events.forEach(e => {
      if (!e.kpId || !e.date || e.date < cut) return;
      const d = (e.payload && e.payload.delta) || 0;
      if (d) byKp[e.kpId] = (byKp[e.kpId] || 0) + d;
    });
    return S.kps.map(p => ({ p, delta: byKp[p.id] || 0 }))
      .filter(x => Math.abs(x.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
      .map(({ p, delta }) => ({
        name: (Engine.courseName(p.courseId) ? Engine.courseName(p.courseId) + ' · ' : '') + p.name,
        start: Math.max(0, Math.min(100, p.mastery - delta)),
        end: p.mastery
      }));
  }

  function vData() {
    const S = Store.state;
    const st = Engine.stats();

    const statCards = `
    <div class="grid4">
      <div class="stat-card"><b>${st.streak}<small style="font-size:13px;color:var(--muted)"> 天</small></b><span>连续学习</span></div>
      <div class="stat-card"><b>${(st.weekMin / 60).toFixed(1)}<small style="font-size:13px;color:var(--muted)"> h</small></b><span>本周投入</span></div>
      <div class="stat-card"><b>${st.totalHours}<small style="font-size:13px;color:var(--muted)"> h</small></b><span>累计学习</span></div>
      <div class="stat-card"><b>${st.due}</b><span>待复习知识点</span></div>
    </div>`;

    const trendRows = trendDays(dataRange);
    const chart = `
    <div class="card">
      <div class="card-head">
        <h3>学习时长趋势</h3>
        <span class="muted sm">分钟 / 天</span>
        <span class="grow"></span>
        <div style="display:flex;gap:6px">
          ${[[7, '近 7 天'], [30, '近 30 天']].map(([n, l]) =>
            `<button class="btn sm ${dataRange === n ? 'primary' : 'ghost'}" data-act="data-range" data-n="${n}">${l}</button>`).join('')}
        </div>
      </div>
      ${svgLineChart(trendRows)}
    </div>`;

    let ei = { total: 0, dist: [], weak: [] };
    try { if (typeof Intel !== 'undefined') ei = Intel.errorIntel(); } catch (e) {}
    const donut = `
    <div class="card">
      <div class="card-head"><h3>错误类型分布</h3><span class="grow"></span>
        <button class="mini" data-act="nav-jump" data-view="mistakes">查看错题本 →</button></div>
      ${ei.total ? svgDonut(ei.dist) : '<div class="empty">还没有错误记录，保持住！</div>'}
    </div>`;

    const bars = `
    <div class="card">
      <div class="card-head"><h3>各科平均掌握度</h3></div>
      ${st.courseStats.map(x => `
        <div class="bar-row">
          <span class="lbl">${esc(x.c.name)}<span class="muted sm"> (${x.count})</span></span>
          <div class="bar"><i style="width:${x.avg}%"></i></div>
          <span class="val">${x.avg}%</span>
        </div>`).join('') || '<div class="empty">暂无数据</div>'}
    </div>`;

    const changes = kpChanges(30);
    const changesCard = `
    <div class="card">
      <div class="card-head"><h3>知识点变化</h3><span class="muted sm">近 30 天掌握度变化（基于打卡与练习）</span></div>
      ${changes.length ? changes.map(c2 => {
        const up = c2.end >= c2.start;
        return `
        <div class="bar-row">
          <span class="lbl" title="${esc(c2.name)}">${esc(c2.name)}</span>
          <div class="bar"><i style="width:${c2.start}%;opacity:.35"></i><i style="width:${c2.end - c2.start}%;margin-left:${c2.start}%;background:${up ? 'var(--green)' : 'var(--red)'}"></i></div>
          <span class="val" style="${up ? 'color:var(--green);width:auto' : 'color:var(--red);width:auto'}">${c2.start}% → ${c2.end}%</span>
        </div>`;
      }).join('') : '<div class="empty">最近 30 天暂无明显变化。<br>坚持打卡和练习，这里会记录你的每一步。</div>'}
    </div>`;

    const bn = `
    <div class="card">
      <div class="card-head"><h3>当前瓶颈</h3></div>
      ${st.bottlenecks.map(b => `
        <div class="bar-row">
          <span class="lbl" title="${esc(b.p.name)}">${esc(b.c ? b.c.name + ' · ' : '')}${esc(b.p.name)}</span>
          <div class="bar"><i style="width:${100 - b.p.mastery}%;background:linear-gradient(90deg,#f59e0b,#e5484d)"></i></div>
          <span class="val sm muted" style="width:auto;max-width:200px;text-align:right">${esc(b.why)}</span>
        </div>`).join('') || '<div class="empty">添加知识点后这里会出现瓶颈分析</div>'}
    </div>`;

    const reports = S.reports.slice(0, 8).map((r, i) => {
      const body = r.type === 'risk'
        ? (() => { try { return JSON.parse(r.content).map(riskCard).join(''); } catch (e) { return '<div class="muted">内容解析失败</div>'; } })()
        : mdToHtml(r.content);
      const title = r.type === 'risk' ? '考试风险预测' : '本周学习报告';
      return `
      <details class="report" ${i === 0 ? 'open' : ''}>
        <summary>${title}<span class="muted sm" style="font-weight:400">${r.date}</span></summary>
        <div class="rep-body">${body}</div>
      </details>`;
    }).join('');

    return `
    <div class="page-head">
      <div><h1>学习数据</h1><div class="sub">你的学习行为与知识状态全景</div></div>
    </div>
    ${statCards}
    ${chart}
    <div class="grid2">
      ${bars}
      ${donut}
    </div>
    ${changesCard}
    ${bn}
    <div class="card">
      <div class="card-head">
        <h3>AI 分析</h3>
        <span class="grow"></span>
        <button class="btn primary sm" data-act="report-week">生成本周报告</button>
        <button class="btn ghost sm" data-act="report-risk">预测考试风险</button>
      </div>
      ${reports || '<div class="empty">还没有生成过报告。点上方按钮让 Agent 分析你的学习状态。</div>'}
    </div>`;
  }

  vData.setRange = n => { dataRange = n; };
  return vData;
})();
