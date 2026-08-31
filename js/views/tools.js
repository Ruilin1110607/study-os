// 工具箱视图（原 app.js vTools/番茄钟/课表/待办/倒计时，忠实搬移）
const ViewsTools = (() => {
  const { $, esc, toast, DAYNAMES } = UI;

  const PRIO = { high: { label: '高', cls: 'red' }, mid: { label: '中', cls: 'amber' }, low: { label: '低', cls: 'gray' } };
  let schedTab = 'all';
  const pomoDef = { focus: 25 * 60, break: 5 * 60 };
  let pomo = { mode: 'focus', running: false, endAt: 0, remain: pomoDef.focus };
  let pomoTimerStarted = false;

  function ensurePomoTimer() {
    if (pomoTimerStarted) return;
    pomoTimerStarted = true;
    setInterval(() => {
      if (!pomo.running) return;
      const left = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
      pomo.remain = left;
      if (left <= 0) { finishPhase(); return; }
      if (window.App && App.view !== 'tools') return;
      const el = $('#pomo-time');
      if (el) {
        el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
        const ring = $('.pomo-ring');
        const totl = pomo.mode === 'focus' ? pomoDef.focus : pomoDef.break;
        if (ring) ring.style.background = `conic-gradient(${pomo.mode === 'focus' ? 'var(--brand)' : 'var(--green)'} ${Math.round((1 - left / totl) * 360)}deg,var(--bg) 0deg)`;
      }
    }, 500);
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 220, 440].forEach(ms => {
        setTimeout(() => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.07;
          o.start(); o.stop(ctx.currentTime + 0.15);
        }, ms);
      });
    } catch (e) {}
  }

  function finishPhase() {
    pomo.running = false;
    if (pomo.mode === 'focus') {
      const S = Store.state;
      const t = Engine.today();
      S.pomodoroLog[t] = S.pomodoroLog[t] || { count: 0, minutes: 0 };
      S.pomodoroLog[t].count++;
      S.pomodoroLog[t].minutes += 25;
      Store.logEvent('pomodoro', '', { minutes: 25 });
      beep();
      toast('完成一个番茄！休息 5 分钟', 'success');
      pomo.mode = 'break';
      pomo.remain = pomoDef.break;
    } else {
      beep();
      toast('休息结束，开始下一个番茄');
      pomo.mode = 'focus';
      pomo.remain = pomoDef.focus;
    }
    Store.save();
  }

  function weekInfo() {
    const ss = Store.state.profile.semesterStart;
    if (!ss) return null;
    const d = Math.floor((new Date(Engine.today() + 'T00:00:00') - new Date(ss + 'T00:00:00')) / 86400000);
    const wk = Math.floor(d / 7) + 1;
    if (wk < 1) return { wk: 0 };
    return { wk, parity: wk % 2 ? 'odd' : 'even' };
  }

  function cdCardHtml(title, date, dd, isCourse, id) {
    const cls = dd < 0 ? '' : dd <= 7 ? 'warn' : dd <= 30 ? 'soon' : '';
    const num = dd < 0 ? `已过 ${-dd}` : dd === 0 ? '今天！' : dd;
    const unit = dd >= 0 && dd !== 0 ? '<small style="font-size:12px;color:var(--muted)"> 天</small>' : '';
    return `<div class="cd-card ${cls}">
      ${isCourse ? '' : `<button class="cd-x" data-act="cd-del" data-id="${id}">×</button>`}
      <div class="ct">${esc(title)}</div>
      <b>${num}${unit}</b>
      <div class="cd-date">${date}</div>
    </div>`;
  }

  function vTools() {
    ensurePomoTimer();
    const S = Store.state;
    const t = Engine.today();
    const wi = weekInfo();

    const cdCards = [];
    S.courses.filter(c => c.examDate).forEach(c => {
      cdCards.push(cdCardHtml(esc(c.name), c.examDate, Engine.diffDays(t, c.examDate), true));
    });
    [...S.countdowns].sort((a, b) => a.date < b.date ? -1 : 1).forEach(c => {
      cdCards.push(cdCardHtml(esc(c.title), c.date, Engine.diffDays(t, c.date), false, c.id));
    });
    const cdCard = `
    <div class="card">
      <div class="card-head"><h3>考试倒计时</h3><span class="grow"></span>
        <button class="btn ghost sm" data-act="cd-add">+ 添加倒计时</button></div>
      ${cdCards.length ? '<div class="cd-row">' + cdCards.join('') + '</div>'
        : '<div class="empty">添加四六级、期末考、考研等目标日期。<br>知识树中设置了考试日期的课程也会自动出现在这里。</div>'}
    </div>`;

    const pl = S.pomodoroLog[t] || { count: 0, minutes: 0 };
    const totl = pomo.mode === 'focus' ? pomoDef.focus : pomoDef.break;
    const deg = Math.round((1 - pomo.remain / totl) * 360);
    const mm = String(Math.floor(pomo.remain / 60)).padStart(2, '0');
    const ss2 = String(pomo.remain % 60).padStart(2, '0');
    const pomoCard = `
    <div class="card pomo-card">
      <div class="card-head" style="justify-content:center"><h3>番茄钟</h3></div>
      <div class="pomo-ring" style="background:conic-gradient(${pomo.mode === 'focus' ? 'var(--brand)' : 'var(--green)'} ${deg}deg,var(--bg) ${deg}deg)">
        <div class="pomo-inner">
          <div class="pomo-time" id="pomo-time">${mm}:${ss2}</div>
          <div class="pomo-mode">${pomo.mode === 'focus' ? '专注' : '休息'}${pomo.running ? ' · 进行中' : ''}</div>
        </div>
      </div>
      <div class="sm muted">今日专注：<b>${pl.count}</b> 个番茄 · <b>${pl.minutes}</b> 分钟</div>
      <div class="pomo-controls">
        <button class="btn primary sm" data-act="pomo-toggle">${pomo.running ? '暂停' : '开始'}</button>
        <button class="btn ghost sm" data-act="pomo-reset">重置</button>
      </div>
      <div class="sub" style="margin-top:10px">25 分钟专注 + 5 分钟休息，完成后自动记录</div>
    </div>`;

    const filtered = S.schedule.filter(x => schedTab === 'all' || x.weeks === 'all' || x.weeks === schedTab);
    const jsDay = new Date(t + 'T00:00:00').getDay();
    const todayIdx = jsDay === 0 ? 7 : jsDay;
    const cols = DAYNAMES.map((dn, i) => {
      const list = filtered.filter(x => Number(x.day) === i + 1)
        .sort((a, b) => a.start < b.start ? -1 : 1);
      return `<div class="sched-col${i + 1 === todayIdx ? ' today' : ''}">
        <h5>${dn}${i + 1 === todayIdx ? ' · 今天' : ''}</h5>
        ${list.length ? list.map(si => `
        <div class="sched-item" style="border-left-color:${si.color || '#4f6bf0'}">
          <div class="si-time">${si.start}–${si.end}${si.weeks !== 'all' ? ' · ' + (si.weeks === 'odd' ? '单周' : '双周') : ''}</div>
          <div class="si-name">${esc(si.name)}</div>
          <div class="si-meta">${esc([si.room, si.teacher].filter(Boolean).join(' · ') || '&nbsp;')}</div>
          <button class="cd-x" data-act="sched-del" data-id="${si.id}" title="删除">×</button>
        </div>`).join('') : '<div class="sched-empty">无课</div>'}
      </div>`;
    }).join('');
    const schedCard = `
    <div class="card">
      <div class="card-head">
        <h3>课程表</h3>
        ${wi && wi.wk > 0 ? `<span class="tag blue">第 ${wi.wk} 周 · ${wi.parity === 'odd' ? '单周' : '双周'}</span>` : ''}
        <span class="grow"></span>
        <div style="display:flex;gap:6px">
          ${[['all', '全部'], ['odd', '单周'], ['even', '双周']].map(([k, l]) =>
            `<button class="btn sm ${schedTab === k ? 'primary' : 'ghost'}" data-act="sched-tab" data-tab="${k}">${l}</button>`).join('')}
        </div>
        <button class="btn ghost sm" data-act="sched-add">+ 添加课程</button>
      </div>
      ${S.schedule.length ? '<div class="sched-grid">' + cols + '</div>'
        : '<div class="empty">还没有录入课程。点「+ 添加课程」建立你的周课表；<br>在右上角设置「学期第一周」日期后，可自动识别当前单双周。</div>'}
    </div>`;

    const rank = { high: 0, mid: 1, low: 2 };
    const todos = [...S.todos].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const da = a.date || '9999', db = b.date || '9999';
      if (da !== db) return da < db ? -1 : 1;
      if (a.priority !== b.priority) return rank[a.priority] - rank[b.priority];
      return a.createdAt < b.createdAt ? -1 : 1;
    });
    const todoItems = todos.map(td => {
      const over = !td.done && td.date && td.date < t;
      return `<div class="todo-item${td.done ? ' done' : ''}">
        <span class="pi-check ${td.done ? 'on' : ''}" data-act="todo-toggle" data-id="${td.id}">✓</span>
        <span class="tt grow">${esc(td.text)}</span>
        ${over ? '<span class="tag red">已逾期</span>' : ''}
        ${td.date ? `<span class="sm" style="${over ? 'color:var(--red);font-weight:600' : 'color:var(--muted)'}">${Engine.fmtCN(td.date)}</span>` : ''}
        <span class="tag ${PRIO[td.priority] ? PRIO[td.priority].cls : 'gray'}">${PRIO[td.priority] ? PRIO[td.priority].label : '中'}</span>
        <button class="mini" data-act="todo-del" data-id="${td.id}">×</button>
      </div>`;
    }).join('');
    const todoCard = `
    <div class="card">
      <div class="card-head">
        <h3>待办清单</h3>
        <span class="grow"></span>
        <span class="muted sm">未完成 ${S.todos.filter(x => !x.done).length} 项</span>
      </div>
      <form id="f-todo" class="todo-form">
        <input name="text" required placeholder="要做什么？" style="flex:1;min-width:160px">
        <input name="date" type="date" style="width:auto">
        <select name="priority" style="width:auto"><option value="high">高优先</option><option value="mid" selected>中优先</option><option value="low">低优先</option></select>
        <button class="btn primary sm" type="submit">添加</button>
      </form>
      ${todos.length ? todoItems : '<div class="empty">清单空空如也</div>'}
    </div>`;

    return `
    <div class="page-head">
      <div><h1>工具箱</h1><div class="sub">核心四件套：课表 · 番茄钟 · 待办 · 倒计时</div></div>
      <label class="sm muted" style="display:inline-flex;align-items:center;gap:6px">学期第一周
        <input type="date" data-chg="semester-start" value="${esc(S.profile.semesterStart || '')}" style="width:auto;padding:6px 10px">
      </label>
    </div>
    <div class="tools-top">${cdCard}${pomoCard}</div>
    ${schedCard}
    ${todoCard}`;
  }

  // 事件层调用的状态操作（调用后由事件层触发重渲染）
  vTools.pomoToggle = () => {
    if (pomo.running) {
      pomo.remain = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
      pomo.running = false;
    } else {
      pomo.endAt = Date.now() + pomo.remain * 1000;
      pomo.running = true;
      ensurePomoTimer();
    }
  };
  vTools.pomoReset = () => {
    pomo.running = false;
    pomo.mode = 'focus';
    pomo.remain = pomoDef.focus;
  };
  vTools.setSchedTab = t => { schedTab = t; };
  vTools.ensurePomoTimer = ensurePomoTimer;

  return vTools;
})();
