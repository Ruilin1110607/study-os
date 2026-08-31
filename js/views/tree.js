// 知识树视图（原 app.js vTree/kpRow/courseAgg，忠实搬移）
const ViewsTree = (() => {
  const { esc, mTag } = UI;

  function kpRow(p) {
    const due = p.nextReview && p.nextReview <= Engine.today();
    const nextTxt = !p.nextReview ? '未安排' : due ? '今日到期' : Engine.fmtCN(p.nextReview);
    const acc = (typeof Intel !== 'undefined') ? Intel.accuracy(p) : null;
    const star = (p.importance || 0) >= 4;
    return `
    <div class="plan-item" style="padding:9px 2px;flex-wrap:wrap">
      <div class="pi-body">
        <div class="pi-title" style="font-size:13.5px;font-weight:500">${star ? '<span style="color:var(--amber)">★</span> ' : ''}${esc(p.name)}</div>
        <div class="meta">
          <span class="tag ${mTag(p.mastery)}">${p.mastery}%</span>
          <span class="sm" style="${due ? 'color:var(--red);font-weight:600' : 'color:var(--muted)'}">复习：${nextTxt}</span>
          ${acc != null ? `<span class="tag ${acc >= 80 ? 'green' : acc >= 60 ? 'blue' : 'red'}">正确率 ${acc}%</span>` : ''}
          ${p.errCount ? `<span class="tag red">错题 ${p.errCount}</span>` : ''}
        </div>
      </div>
      <button class="mini" data-act="kp-practice" data-id="${p.id}">练习</button>
      <button class="mini" data-act="kp-checkin" data-id="${p.id}">打卡</button>
      <button class="mini" data-act="kp-mistake" data-id="${p.id}">记错题</button>
      <button class="mini ${star ? 'star-on' : ''}" data-act="kp-star" data-id="${p.id}">${star ? '★ 核心' : '☆ 标核心'}</button>
      <button class="mini" data-act="kp-del" data-id="${p.id}">×</button>
    </div>`;
  }

  function courseAgg(courseId) {
    const S = Store.state;
    const ids = new Set(S.kps.filter(p => p.courseId === courseId).map(p => p.id));
    let minutes = 0, lastStudy = '';
    S.logs.forEach(l => {
      if (!ids.has(l.kpId)) return;
      minutes += l.minutes || 0;
      if (l.date && l.date > lastStudy) lastStudy = l.date;
    });
    const atts = S.attempts.filter(a => ids.has(a.kpId));
    const acc = atts.length ? Math.round(atts.filter(a => a.isCorrect).length / atts.length * 100) : null;
    const qcount = S.questions.filter(q => ids.has(q.kpId)).length;
    const weak = S.kps
      .filter(p => p.courseId === courseId && ((p.errCount || 0) > 0 || p.mastery < 60))
      .sort((a, b) => (100 - b.mastery) + b.errCount * 6 - ((100 - a.mastery) + a.errCount * 6))
      .slice(0, 3);
    return { minutes, lastStudy, acc, qcount, weak };
  }

  function vTree() {
    const S = Store.state;
    const head = `
    <div class="page-head">
      <div><h1>知识树</h1><div class="sub">课程 → 章节 → 知识点；打卡和记错题会自动更新掌握度与复习排期</div></div>
      <button class="btn primary sm" data-act="course-add">+ 新建课程</button>
    </div>`;
    if (!S.courses.length) {
      return head + `<div class="card"><div class="empty">还没有课程。<br>先新建一门课，或到「设置」载入示例数据体验完整功能。</div></div>`;
    }
    const cards = S.courses.map(c => {
      const kps = S.kps.filter(p => p.courseId === c.id);
      const avg = kps.length ? Math.round(kps.reduce((a, p) => a + p.mastery, 0) / kps.length) : 0;
      const agg = courseAgg(c.id);
      const dd = c.examDate ? Engine.diffDays(Engine.today(), c.examDate) : -1;
      const metaRow = (kps.length || agg.minutes) ? `
      <div class="course-meta">
        ${agg.minutes ? `<span title="累计学习时长">⏱ <b>${(agg.minutes / 60).toFixed(1)}</b> h</span>` : ''}
        <span>📚 <b>${kps.length}</b> 个知识点 · 平均 <b>${avg}%</b></span>
        ${agg.qcount ? `<span title="题库题目数">📝 题目 <b>${agg.qcount}</b></span>` : ''}
        ${agg.acc != null ? `<span title="练习正确率">✅ 正确率 <b style="${agg.acc >= 80 ? 'color:var(--green)' : agg.acc >= 60 ? '' : 'color:var(--red)'}">${agg.acc}%</b></span>` : ''}
        ${agg.lastStudy ? `<span title="最近学习日期">🕐 最近学习 ${Engine.fmtCN(agg.lastStudy)}</span>` : ''}
        ${dd >= 0 ? `<span class="${dd <= 14 ? 'cm-warn' : ''}">📅 考试还有 <b>${dd}</b> 天</span>` : ''}
        ${agg.weak.length ? `<span class="cm-weak" title="${esc(agg.weak.map(w => w.name).join('、'))}">🎯 薄弱：${esc(agg.weak[0].name)}${agg.weak.length > 1 ? ` 等 ${agg.weak.length} 个` : ''}</span>` : ''}
      </div>` : '';
      const groups = [];
      const seen = {};
      kps.forEach(p => {
        const ch = p.chapter || '未分组';
        if (!seen[ch]) { seen[ch] = []; groups.push([ch, seen[ch]]); }
        seen[ch].push(p);
      });
      const body = groups.map(([ch, list]) => `
        <div style="margin-bottom:10px">
          <div class="sm muted" style="margin-bottom:4px">${esc(ch)} · ${list.length}</div>
          ${list.map(kpRow).join('')}
        </div>`).join('');
      return `
      <div class="card">
        <div class="card-head">
          <span style="width:11px;height:11px;border-radius:50%;background:${c.color};flex-shrink:0"></span>
          <h3>${esc(c.name)}</h3>
          <label class="sm muted" style="display:inline-flex;align-items:center;gap:6px;margin:0">考试日期
            <input type="date" data-chg="exam-date" data-id="${c.id}" value="${c.examDate || ''}" style="width:auto;padding:5px 8px">
          </label>
          <span class="grow"></span>
          <button class="btn ghost sm" data-act="kp-add" data-course="${c.id}">+ 知识点</button>
          <button class="mini" data-act="course-del" data-id="${c.id}">删除课程</button>
        </div>
        ${metaRow}
        ${body || '<div class="empty">还没有知识点，点右上角添加</div>'}
      </div>`;
    }).join('');
    return head + cards;
  }

  return vTree;
})();
