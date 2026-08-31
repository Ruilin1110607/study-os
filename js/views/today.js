// 今日视图（原 app.js vToday，忠实搬移）
const ViewsToday = (() => {
  const { esc, tagCls, stTag } = UI;

  function vToday() {
    const S = Store.state;
    const st = Engine.stats();
    const h = new Date().getHours();
    const greet = h < 6 ? '夜深了' : h < 9 ? '早上好' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    const name = S.profile.name || '同学';
    const t = Engine.today();

    const exams = S.courses
      .filter(c => c.examDate && Engine.diffDays(t, c.examDate) >= 0)
      .sort((a, b) => Engine.diffDays(t, a.examDate) - Engine.diffDays(t, b.examDate))
      .map(c => {
        const dd = Engine.diffDays(t, c.examDate);
        return `<span class="chip exam${dd <= 14 ? ' warn' : ''}">${esc(c.name)} · ${dd} 天后考试</span>`;
      }).join('');

    const stale = S.planItems.length && S.planDate !== t
      ? '<span class="tag amber">昨天的计划</span>' : '';

    let stripHtml = '';
    try {
      if (typeof Profiler !== 'undefined') {
        const m = Profiler.compute();
        if (m) {
          const lastA = S.assessments[0];
          const worst = Math.min(m.consistency, m.efficiency, m.errorPattern, m.balance);
          const avg = Math.round((m.consistency + m.efficiency + m.errorPattern + m.balance) / 4);
          const status = lastA ? lastA.report.status : avg >= 78 ? '优秀' : avg >= 62 ? '良好' : worst < 40 ? '需警惕' : '一般';
          const label = lastA ? lastA.report.label : (status === '需警惕' ? '状态波动，注意节奏' : status === '一般' ? '稳步推进中' : '学习状态在线');
          const bar = (name, v) => `<div class="pm"><span class="sm muted">${name}</span><div class="pm-bar"><i style="width:${v}%;background:${v >= 70 ? 'var(--green)' : v >= 45 ? 'var(--amber)' : 'var(--red)'}"></i></div><b class="sm">${v}</b></div>`;
          stripHtml = `<div class="card prof-strip">
            <div class="prof-status">
              <span class="tag ${stTag(status)}" style="font-size:13px;padding:4px 12px">${status}</span>
              <span class="sm muted">${esc(label)}${lastA ? ' · ' + lastA.date + ' 体检' : ' · 本地实时评估'}</span>
            </div>
            <div class="prof-metrics">
              ${bar('一致性', m.consistency)}${bar('效率', m.efficiency)}${bar('纠错力', m.errorPattern)}${bar('科目均衡', m.balance)}
            </div>
          </div>`;
        }
      }
    } catch (e) { stripHtml = ''; }

    const unread = S.assessments.filter(a => a.ts > (S.notifyReadTs || 0)).length;
    const latestAssess = S.assessments[0];
    const adjustBanner = latestAssess && latestAssess.report.adjustPlan && latestAssess.ts > (S.planGenTs || 0)
      ? `<div class="note" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
           <span>体检建议调整计划：${esc(latestAssess.report.adjustReason || '')}</span>
           <button class="btn primary sm" data-act="apply-adjust">按建议重排</button>
         </div>`
      : '';

    let insightsHtml = '';
    try {
      if (typeof Intel !== 'undefined') {
        const ins = Intel.insights();
        if (ins.length) insightsHtml = `<div class="card">
          <div class="card-head"><h3>Agent 洞察</h3><span class="muted sm">基于你此刻的数据</span></div>
          ${ins.map(i => `
          <div class="insight-row">
            <span class="ii">${i.icon}</span>
            <div class="it grow">${esc(i.text)}</div>
            ${i.act ? `<button class="btn ghost sm" data-act="insight-go" data-kind="${esc(i.act)}" ${i.kpId ? `data-id="${i.kpId}"` : ''}>去处理</button>` : ''}
          </div>`).join('')}
        </div>`;
      }
    } catch (e) { insightsHtml = ''; }

    const todaysItems = S.planItems.filter(i => !i.planDate || i.planDate <= t);
    const futureItems = S.planItems.filter(i => i.planDate && i.planDate > t)
      .sort((a, b) => (a.planDate < b.planDate ? -1 : 1));
    const items = todaysItems.length ? todaysItems.map(it => `
      <li class="plan-item ${it.done ? 'done' : ''}">
        <span class="pi-check ${it.done ? 'on' : ''}" data-act="item-toggle" data-id="${it.id}">✓</span>
        <div class="pi-body">
          <div class="pi-title">${esc(it.title)}</div>
          <div class="meta">
            <span class="tag ${tagCls(it.tag)}">${esc(it.tag)}</span>
            <span class="muted sm">${it.minutes} 分钟</span>
            ${it.source === 'ai' ? '<span class="tag blue">AI 规划</span>' : ''}
            ${it.source === 'agent' ? '<span class="tag blue">Agent</span>' : ''}
            ${it.source === 'rule' ? '<span class="tag gray">规则规划</span>' : ''}
          </div>
          ${it.reason ? `<div class="reason">${esc(it.reason)}</div>` : ''}
        </div>
      </li>`).join('')
      : `<li><div class="empty">今天还没有学习清单<br>点右上角「生成今日计划」开始</div></li>`;

    const totalMin = todaysItems.reduce((a, i) => a + i.minutes, 0);
    const doneMin = todaysItems.filter(i => i.done).reduce((a, i) => a + i.minutes, 0);
    const pct = totalMin ? Math.round(doneMin / totalMin * 100) : 0;
    const futureNote = futureItems.length ? `
      <div class="note" style="background:var(--purple-soft);color:var(--purple)">🗓️ Agent 已排入未来任务 ${futureItems.length} 项（最早 ${Engine.fmtCN(futureItems[0].planDate)}）：${futureItems.slice(0, 3).map(x => esc(x.title)).join('、')}${futureItems.length > 3 ? ' 等' : ''}。到日期会自动出现在当日清单。</div>` : '';

    const todayMin = S.logs.filter(l => l.date === t).reduce((a, l) => a + (l.minutes || 0), 0)
      + ((S.pomodoroLog && S.pomodoroLog[t]) ? S.pomodoroLog[t].minutes : 0);
    const overallMastery = S.kps.length
      ? Math.round(S.kps.reduce((a, p) => a + p.mastery, 0) / S.kps.length) : 0;
    const weekGoalPct = Math.min(100, Math.round(
      st.weekMin / Math.max(60, (S.profile.dailyMinutes || 120) * 7) * 100));

    return `
    <div class="page-head">
      <div>
        <h1>${greet}，${esc(name)}</h1>
        <div class="sub">${t} ${Engine.weekday(t)}${S.profile.goal ? ' · 目标：' + esc(S.profile.goal) : ''}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn ghost sm" data-act="notif-open">通知${unread ? `<span class="badge">${unread}</span>` : ''}</button>
        <button class="btn primary sm" data-act="gen-plan">生成今日计划</button>
      </div>
    </div>

    <div class="chips-row">
      <span class="chip stat">今日学习<b>${todayMin} 分钟</b></span>
      <span class="chip stat">本周投入<b>${(st.weekMin / 60).toFixed(1)} h</b><span class="sm muted">（周目标 ${weekGoalPct}%）</span></span>
      <span class="chip stat">总体掌握度<b>${overallMastery}%</b></span>
      <span class="chip stat">连续学习<b>${st.streak} 天</b></span>
      <span class="chip stat">待复习<b>${st.due} 项</b></span>
      ${exams}
    </div>

    ${stripHtml}
    ${insightsHtml}

    <div class="card">
      <div class="card-head">
        <h3>今日学习清单</h3>${stale}
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="replan-open">调整计划</button>
        <button class="btn ghost sm" data-act="task-add">+ 加任务</button>
      </div>
      <ul class="plan-list" style="list-style:none">${items}</ul>
      ${totalMin ? `
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="sub" style="margin-top:6px">已完成 ${doneMin} / ${totalMin} 分钟 · ${pct}%</div>` : ''}
      ${S.planNote ? `<div class="note">${esc(S.planNote)}</div>` : ''}
      ${futureNote}
      ${adjustBanner}
    </div>`;
  }

  return vToday;
})();
