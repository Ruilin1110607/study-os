// 错题本视图（原 app.js vMistakes/mkCard，忠实搬移）
const ViewsMistakes = (() => {
  const { esc } = UI;
  let mkFilter = '';

  function mkCard(m) {
    const p = Engine.kp(m.kpId);
    const a = m.analysis;
    const sevTag = a && a.severity ? `<span class="tag ${a.severity === '高' ? 'red' : a.severity === '中' ? 'amber' : 'gray'}">紧迫度 ${esc(a.severity)}</span>` : '';
    return `
    <div class="mk-item" ${m.done ? 'style="opacity:.55"' : ''}>
      <div class="mk-head">
        <span class="tag red">${esc(m.tag)}</span>
        <b class="sm">${esc(p ? Engine.courseName(p.courseId) + ' · ' + p.name : '(知识点已删除)')}</b>
        <span class="muted sm">${Engine.fmtCN(m.date)}</span>
        ${m.done ? '<span class="tag green">已解决</span>' : ''}
        <span class="grow"></span>
        ${sevTag}
        <button class="mini" data-act="mk-diag" data-id="${m.id}">${a ? '重新诊断' : 'AI 诊断'}</button>
        <button class="mini" data-act="mk-del" data-id="${m.id}">×</button>
      </div>
      <div class="mk-desc sm">${m.desc ? esc(m.desc) : '<span class="muted">(无描述)</span>'}</div>
      ${a ? `
      <div class="analysis">
        <p><b>根因定位：</b>${esc(a.reason)}</p>
        <p><b>概念缺口：</b>${esc(a.gap)}</p>
        <p><b>补救建议：</b>${esc(a.advice)}</p>
      </div>
      <div class="mk-foot">
        <button class="btn ghost sm" data-act="mk-review" data-id="${m.id}">按建议加入明天复习</button>
        <button class="btn ghost sm" data-act="mk-resolve" data-id="${m.id}">${m.done ? '取消已解决' : '标记已解决'}</button>
      </div>` : ''}
    </div>`;
  }

  function vMistakes() {
    const S = Store.state;
    const opts = ['<option value="">全部课程</option>']
      .concat(S.courses.map(c => `<option value="${c.id}" ${mkFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`))
      .join('');
    const list = [...S.mistakes].reverse().filter(m => {
      if (!mkFilter) return true;
      const p = Engine.kp(m.kpId);
      return p && p.courseId === mkFilter;
    });

    let ei = { total: 0, dist: [], weak: [] };
    try { if (typeof Intel !== 'undefined') ei = Intel.errorIntel(); } catch (e) {}
    const distCard = ei.total ? `
    <div class="card">
      <div class="card-head"><h3>错因分布</h3><span class="muted sm">近 ${ei.total} 条错误记录</span></div>
      ${ei.dist.map(d2 => `
      <div class="bar-row">
        <span class="lbl">${esc(d2.tag)}</span>
        <div class="bar"><i style="width:${d2.pct}%;background:linear-gradient(90deg,#e5484d,#f59e0b)"></i></div>
        <span class="val">${d2.count}</span>
      </div>`).join('')}
      ${ei.weak.length ? `<div class="sub" style="margin-top:12px">最需要攻克：
        ${ei.weak.map(w => esc(w.name)).join('、')}</div>` : ''}
    </div>` : '';

    return `
    <div class="page-head">
      <div><h1>错题本</h1><div class="sub">记录错题后可让 AI 定位根因；记错题的知识点第二天自动进入复习队列</div></div>
      <div style="display:flex;gap:10px;align-items:center">
        <select data-chg="mk-filter" style="width:auto;padding:7px 10px">${opts}</select>
        <button class="btn primary sm" data-act="mk-add">+ 记录错题</button>
      </div>
    </div>
    ${distCard}
    ${list.length ? list.map(mkCard).join('') : '<div class="card"><div class="empty">暂无错题记录</div></div>'}`;
  }

  vMistakes.setFilter = v => { mkFilter = v; };
  return vMistakes;
})();
