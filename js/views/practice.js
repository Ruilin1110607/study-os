// 练习室视图（原 app.js vPractice/accPct/qRowHtml，忠实搬移）
const ViewsPractice = (() => {
  const { esc } = UI;

  function accPct() {
    const A = Store.state.attempts.slice(-20);
    if (!A.length) return null;
    return Math.round(A.filter(a => a.isCorrect).length / A.length * 100);
  }

  function qRowHtml(q) {
    const p = Engine.kp(q.kpId);
    return `
    <div class="plan-item" style="padding:8px 0;flex-wrap:wrap">
      <div class="pi-body">
        <div class="pi-title" style="font-size:13px;font-weight:500" title="${esc(q.stem)}">${esc(q.stem.length > 46 ? q.stem.slice(0, 46) + '…' : q.stem)}</div>
        <div class="meta">
          <span class="sm muted">${esc(p ? p.name : '(知识点已删除)')}</span>
          ${q.source === 'ai' ? '<span class="tag blue">AI 出题</span>' : '<span class="tag gray">手动</span>'}
        </div>
      </div>
      <button class="mini" data-act="prac-one" data-id="${q.id}">单练</button>
      <button class="mini" data-act="q-del" data-id="${q.id}">×</button>
    </div>`;
  }

  function vPractice() {
    ViewsTools.ensurePomoTimer();
    const S = Store.state;
    const t = Engine.today();
    const todayN = S.attempts.filter(a => a.date === t).length;
    const acc = accPct();
    let missions = [];
    try { if (typeof Intel !== 'undefined') missions = Intel.missions(3); } catch (e) {}

    const missionCard = `
    <div class="card">
      <div class="card-head"><h3>智能推荐</h3><span class="muted sm">薄弱度 × 遗忘风险 × 考试紧迫，自动排序</span></div>
      ${missions.length ? missions.map(({ p, m }) => `
      <div class="mission-row">
        <div class="m-score">${m.score}</div>
        <div class="m-body">
          <div style="font-weight:600;font-size:13.5px">${esc((Engine.courseName(p.courseId) ? Engine.courseName(p.courseId) + ' · ' : '') + p.name)}</div>
          <div class="meta">
            <span class="tag ${m.level === 'high' ? 'red' : m.level === 'mid' ? 'amber' : 'green'}">遗忘风险 ${m.risk}</span>
            <span class="muted sm">${esc(m.reasons.join(' · '))}</span>
            <span class="muted sm">建议 ${m.recMin} 分钟</span>
          </div>
        </div>
        <button class="btn ghost sm" data-act="prac-self" data-id="${p.id}">快速自测</button>
        ${AI.ready() ? `<button class="btn primary sm" data-act="prac-gen-kp" data-id="${p.id}">AI 出题</button>` : ''}
      </div>`).join('') : '<div class="empty">先到「知识树」添加知识点，<br>这里会自动给出今天最值得练的目标</div>'}
    </div>`;

    const groups = [];
    const seenQ = {};
    S.questions.forEach(q => {
      const p = Engine.kp(q.kpId);
      const key = p ? p.courseId : '_none';
      if (!seenQ[key]) { seenQ[key] = { courseId: key, qs: [] }; groups.push(seenQ[key]); }
      seenQ[key].qs.push(q);
    });
    const bankCard = `
    <div class="card">
      <div class="card-head">
        <h3>我的题库</h3>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="q-add-open">+ 手动加题</button>
        ${AI.ready() ? '<button class="btn primary sm" data-act="q-gen-open">AI 批量出题</button>' : ''}
      </div>
${bankBody()}
    </div>`;

    function bankBody() {
      if (!S.questions.length) {
        const tip = AI.ready()
          ? '点右上角「AI 批量出题」，或对智能推荐的知识点点「AI 出题」。'
          : '配置 AI 后可一键出题；现在也可以用「手动加题」和上方「快速自测」。';
        return '<div class="empty">题库还是空的。<br>' + tip + '</div>';
      }
      return groups.map(g => {
        const c = Engine.course(g.courseId);
        const choiceN = g.qs.filter(q => q.options && q.options.length >= 2).length;
        const summary = esc(c ? c.name : '未关联课程') + '<span class="muted sm" style="font-weight:400">' + g.qs.length + ' 题</span>';
        const body = '<div style="margin-bottom:8px"><button class="btn primary sm" data-act="prac-set" data-course="' + esc(g.courseId) + '">整组开练（' + choiceN + ' 道选择题）</button></div>' + g.qs.slice().reverse().map(qRowHtml).join('');
        return '<details class="report"><summary>' + summary + '</summary><div class="rep-body">' + body + '</div></details>';
      }).join('');
    }

    const recent = S.attempts.slice(-8).reverse().map(a => {
      const p = Engine.kp(a.kpId);
      return `
      <div class="plan-item" style="padding:7px 2px">
        <div class="pi-body">
          <div class="pi-title" style="font-size:13px;font-weight:500">${esc(p ? p.name : '(知识点已删除)')}</div>
          <div class="meta"><span class="sm muted">${a.date} ${new Date(a.ts).toTimeString().slice(0, 5)}</span></div>
        </div>
        <span class="tag ${a.isCorrect ? 'green' : 'red'}">${a.isCorrect ? '答对' : '答错'}</span>
      </div>`;
    }).join('');
    const recentCard = `
    <div class="card">
      <div class="card-head"><h3>最近练习</h3><span class="grow"></span>
        <span class="muted sm">累计 ${S.attempts.length} 次</span></div>
      ${recent || '<div class="empty">还没有练习记录，从上面的智能推荐开始吧</div>'}
    </div>`;

    return `
    <div class="page-head">
      <div><h1>练习室</h1><div class="sub">主动回忆是最强的记忆方式 —— 练错的知识点会回流错题本与复习队列</div></div>
      <div class="chips-row" style="margin:0">
        <span class="chip stat">今日练习<b>${todayN} 次</b></span>
        <span class="chip stat">近20次正确率<b>${acc == null ? '—' : acc + '%'}</b></span>
      </div>
    </div>
    ${missionCard}${bankCard}${recentCard}`;
  }

  return vPractice;
})();