const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function mdToHtml(s) {
    let t = esc(s);
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    t = t.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
    t = t.replace(/^\s*[-*]\s+(.+)$/gm, '&middot; $1');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t.replace(/\n/g, '<br>');
  }

  let view = 'today';
  let mkFilter = '';
  let ckCtx = null;
  let genBusy = false;
  let aiBusy = false;
  let chatting = false;

  const TAGC = { '到期复习': 'amber', '薄弱推进': 'blue', '新学': 'green', '练习': 'purple', '休息': 'gray' };
  const tagCls = t => TAGC[t] || 'gray';
  const mTag = m => m >= 80 ? 'green' : m >= 60 ? 'blue' : m >= 35 ? 'amber' : 'red';
  const stTag = s => ({ '优秀': 'green', '良好': 'blue', '一般': 'amber', '需警惕': 'red' }[s] || 'gray');

  const TEMPLATES = {
    '数据科学': {
      major: '数据科学',
      directions: [
        {
          name: '数学基础',
          courses: [
            { name: '高等数学', chapters: ['极限与连续', '导数与微分', '不定积分', '定积分与应用', '级数'] },
            { name: '线性代数', chapters: ['行列式', '矩阵运算', '向量组与方程组', '特征值与二次型'] },
            { name: '概率论与数理统计', chapters: ['随机变量与分布', '数字特征', '大数定律与抽样', '参数估计与假设检验'] }
          ]
        },
        {
          name: '编程能力',
          courses: [
            { name: 'Python 程序设计', chapters: ['基础语法与数据类型', '流程控制与函数', '面向对象', '常用标准库'] },
            { name: 'C 语言程序设计', chapters: ['基本语法', '控制流程', '数组与字符串', '指针与结构体'] },
            { name: '数据结构与算法', chapters: ['线性表与栈队列', '树与二叉树', '图', '排序查找与算法思想'] }
          ]
        },
        {
          name: '统计与机器学习',
          courses: [
            { name: '统计学', chapters: ['描述统计', '抽样与估计', '假设检验', '回归分析'] },
            { name: '机器学习', chapters: ['监督学习基础', '模型评估与选择', '特征工程', '常用算法实践'] },
            { name: '深度学习基础', chapters: ['神经网络基础', '卷积网络', '序列模型', '训练与调优'] }
          ]
        },
        {
          name: '数据工程与实践',
          courses: [
            { name: '数据库与 SQL', chapters: ['关系模型与建表', 'SQL 查询进阶', '索引与优化'] },
            { name: '数据处理', chapters: ['NumPy 数值计算', 'Pandas 数据清洗', '数据重塑与合并'] },
            { name: '数据分析与可视化', chapters: ['探索性分析', '图表设计原则', 'BI 与报表实践'] }
          ]
        }
      ]
    },
    '计算机科学与技术': {
      major: '计算机科学与技术',
      directions: [
        {
          name: '数学与理论',
          courses: [
            { name: '高等数学', chapters: ['极限与连续', '微分方程', '多元微积分', '级数'] },
            { name: '线性代数', chapters: ['行列式与矩阵', '向量空间', '特征值与二次型'] },
            { name: '离散数学', chapters: ['集合与逻辑', '关系与函数', '图论', '代数系统'] }
          ]
        },
        {
          name: '系统与底层',
          courses: [
            { name: 'C 语言程序设计', chapters: ['基本语法', '控制流程', '数组指针', '结构体与文件'] },
            { name: '计算机组成原理', chapters: ['数据的表示', '指令系统', 'CPU 结构', '存储器与 IO'] },
            { name: '操作系统', chapters: ['进程与线程', '内存管理', '文件系统', '设备管理与并发'] }
          ]
        },
        {
          name: '软件开发',
          courses: [
            { name: '数据结构与算法', chapters: ['线性表与栈队列', '树与二叉树', '图论算法', '排序查找与动态规划'] },
            { name: '数据库系统', chapters: ['关系模型与 SQL', '数据库设计', '事务与并发控制'] },
            { name: '计算机网络', chapters: ['体系结构与物理层', '数据链路层', '网络层与传输层', '应用层'] }
          ]
        },
        {
          name: '方向进阶',
          courses: [
            { name: '软件工程', chapters: ['需求分析', '系统设计', '测试与维护'] },
            { name: '编译原理', chapters: ['词法分析', '语法分析', '语义分析与代码生成'] },
            { name: '人工智能导论', chapters: ['搜索与推理', '机器学习入门', '神经网络初步'] }
          ]
        }
      ]
    }
  };

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function openModal(html) {
    $('#modal-root').innerHTML =
      '<div class="modal-backdrop"><div class="modal">' + html + '</div></div>';
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function guardAI() {
    if (!AI.ready()) { toast('请先在「设置」中配置 AI 接口', 'error'); return false; }
    return true;
  }

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
      if (window.Profiler) {
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

    const items = S.planItems.length ? S.planItems.map(it => `
      <li class="plan-item ${it.done ? 'done' : ''}">
        <span class="pi-check ${it.done ? 'on' : ''}" data-act="item-toggle" data-id="${it.id}">✓</span>
        <div class="pi-body">
          <div class="pi-title">${esc(it.title)}</div>
          <div class="meta">
            <span class="tag ${tagCls(it.tag)}">${esc(it.tag)}</span>
            <span class="muted sm">${it.minutes} 分钟</span>
            ${it.source === 'ai' ? '<span class="tag blue">AI 规划</span>' : ''}
            ${it.source === 'rule' ? '<span class="tag gray">规则规划</span>' : ''}
          </div>
          ${it.reason ? `<div class="reason">${esc(it.reason)}</div>` : ''}
        </div>
      </li>`).join('')
      : `<li><div class="empty">今天还没有学习清单<br>点右上角「生成今日计划」开始</div></li>`;

    const totalMin = S.planItems.reduce((a, i) => a + i.minutes, 0);
    const doneMin = S.planItems.filter(i => i.done).reduce((a, i) => a + i.minutes, 0);
    const pct = totalMin ? Math.round(doneMin / totalMin * 100) : 0;

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
      <span class="chip stat">连续学习<b>${st.streak} 天</b></span>
      <span class="chip stat">本周投入<b>${(st.weekMin / 60).toFixed(1)} h</b></span>
      <span class="chip stat">待复习<b>${st.due} 项</b></span>
      ${exams}
    </div>

    ${stripHtml}

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
      ${adjustBanner}
    </div>`;
  }

  function kpRow(p) {
    const due = p.nextReview && p.nextReview <= Engine.today();
    const nextTxt = !p.nextReview ? '未安排' : due ? '今日到期' : Engine.fmtCN(p.nextReview);
    return `
    <div class="plan-item" style="padding:9px 2px">
      <div class="pi-body">
        <div class="pi-title" style="font-size:13.5px;font-weight:500">${esc(p.name)}</div>
        <div class="meta">
          <span class="tag ${mTag(p.mastery)}">${p.mastery}%</span>
          <span class="sm" style="${due ? 'color:var(--red);font-weight:600' : 'color:var(--muted)'}">复习：${nextTxt}</span>
          ${p.errCount ? `<span class="tag red">错题 ${p.errCount}</span>` : ''}
        </div>
      </div>
      <button class="mini" data-act="kp-checkin" data-id="${p.id}">打卡</button>
      <button class="mini" data-act="kp-mistake" data-id="${p.id}">记错题</button>
      <button class="mini" data-act="kp-del" data-id="${p.id}">×</button>
    </div>`;
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
          <span class="muted sm">${kps.length} 个知识点 · 平均掌握 ${avg}%</span>
          <label class="sm muted" style="display:inline-flex;align-items:center;gap:6px;margin:0">考试日期
            <input type="date" data-chg="exam-date" data-id="${c.id}" value="${c.examDate || ''}" style="width:auto;padding:5px 8px">
          </label>
          <span class="grow"></span>
          <button class="btn ghost sm" data-act="kp-add" data-course="${c.id}">+ 知识点</button>
          <button class="mini" data-act="course-del" data-id="${c.id}">删除课程</button>
        </div>
        ${body || '<div class="empty">还没有知识点，点右上角添加</div>'}
      </div>`;
    }).join('');
    return head + cards;
  }

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
    return `
    <div class="page-head">
      <div><h1>错题本</h1><div class="sub">记录错题后可让 AI 定位根因；记错题的知识点第二天自动进入复习队列</div></div>
      <div style="display:flex;gap:10px;align-items:center">
        <select data-chg="mk-filter" style="width:auto;padding:7px 10px">${opts}</select>
        <button class="btn primary sm" data-act="mk-add">+ 记录错题</button>
      </div>
    </div>
    ${list.length ? list.map(mkCard).join('') : '<div class="card"><div class="empty">暂无错题记录</div></div>'}`;
  }

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

  function vData() {
    const S = Store.state;
    const st = Engine.stats();
    const maxMin = Math.max(...st.trend.map(d => d.minutes), 30);

    const statCards = `
    <div class="grid4">
      <div class="stat-card"><b>${st.streak}<small style="font-size:13px;color:var(--muted)"> 天</small></b><span>连续学习</span></div>
      <div class="stat-card"><b>${(st.weekMin / 60).toFixed(1)}<small style="font-size:13px;color:var(--muted)"> h</small></b><span>本周投入</span></div>
      <div class="stat-card"><b>${st.totalHours}<small style="font-size:13px;color:var(--muted)"> h</small></b><span>累计学习</span></div>
      <div class="stat-card"><b>${st.due}</b><span>待复习知识点</span></div>
    </div>`;

    const chart = `
    <div class="card">
      <div class="card-head"><h3>近 14 天学习时长</h3></div>
      <div class="chart">${st.trend.map(d =>
        `<div class="col"><i style="height:${Math.round(d.minutes / maxMin * 100)}%" title="${d.date} · ${d.minutes} 分钟"></i></div>`).join('')}</div>
      <div class="xlabels">${st.trend.map(d => `<span>${parseInt(d.date.split('-')[2], 10)}</span>`).join('')}</div>
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
    ${statCards}${chart}${bars}${bn}
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

  function vSettings() {
    const S = Store.state;
    const p = S.profile;
    const api = S.api;
    const GOALS = ['保研 · 高绩点', '考研备战', '通过期末', '技能提升', '留学申请'];
    const goalOpts = GOALS.map(g => `<option ${p.goal === g ? 'selected' : ''}>${g}</option>`).join('')
      + (p.goal && !GOALS.includes(p.goal) ? `<option selected>${esc(p.goal)}</option>` : '');
    const presetOpts = Object.entries(AI.PRESETS)
      .map(([k, v]) => `<option value="${k}" ${api.preset === k ? 'selected' : ''}>${v.label}</option>`).join('');
    return `
    <div class="page-head"><div><h1>设置</h1></div></div>

    <div class="card">
      <div class="card-head"><h3>个人资料</h3></div>
      <form id="f-profile">
        <div class="grid2">
          <div class="field"><label>昵称</label><input name="name" value="${esc(p.name)}" placeholder="怎么称呼你"></div>
          <div class="field"><label>专业</label><input name="major" value="${esc(p.major)}" placeholder="如：数据科学"></div>
          <div class="field"><label>本学期目标</label><select name="goal">${goalOpts}</select></div>
          <div class="field"><label>每日可用学习（分钟）</label><input name="dailyMinutes" type="number" min="20" step="10" value="${p.dailyMinutes || 180}"></div>
        </div>
        <button class="btn primary sm" type="submit">保存资料</button>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>AI 接口</h3>
        <span class="grow"></span>
        <span class="sm" style="${AI.ready() ? 'color:var(--green)' : 'color:var(--muted)'}">${AI.ready() ? '● 已就绪' : '○ 未配置'}</span>
      </div>
      <form id="f-api">
        <div class="field"><label>服务商预设</label><select id="api-preset" data-chg="api-preset">${presetOpts}</select></div>
        <div class="grid2">
          <div class="field"><label>接口地址 Base URL</label><input id="f-base" value="${esc(api.base)}" placeholder="https://api.deepseek.com/v1"></div>
          <div class="field"><label>模型名称</label><input id="f-model" value="${esc(api.model)}" placeholder="deepseek-chat"></div>
        </div>
        <div class="field"><label>API Key（仅保存在本机浏览器）</label><input id="f-key" type="password" value="${esc(api.key)}" placeholder="sk-..."></div>
        <div style="display:flex;gap:10px">
          <button class="btn primary sm" type="submit">保存配置</button>
          <button class="btn ghost sm" type="button" data-act="api-test">测试连接</button>
        </div>
        <div class="sub" style="margin-top:10px">Key 只存在本机浏览器 localStorage，请求由浏览器直连服务商，不经过任何第三方服务器。推荐 DeepSeek（注册即送额度）。若报网络/CORS 错误请更换服务商。</div>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><h3>数据管理</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export">导出备份</button>
        <button class="btn ghost sm" data-act="import-btn">导入备份</button>
        <button class="btn ghost sm" data-act="demo-load">载入示例数据</button>
        <button class="btn danger sm" data-act="wipe">清空学习数据</button>
        <input type="file" id="import-file" accept=".json" style="display:none">
      </div>
      <div class="sub" style="margin-top:10px">清空不会清除 API 配置。所有数据仅保存在本机，换电脑前记得导出备份。</div>
    </div>`;
  }

  function mapTreeHtml(map) {
    return `<div class="map-major">${esc(map.major)}</div>` +
      (map.directions || []).map(d => `
      <div class="map-dir">
        <b>${esc(d.name)}</b>
        ${(d.courses || []).map(c => `
        <div class="map-course">
          <span>${esc(c.name)}</span>
          <span class="map-chapters">${(c.chapters || []).map(ch => `<i>${esc(ch)}</i>`).join('')}</span>
        </div>`).join('')}
      </div>`).join('');
  }

  function assessHtml(a) {
    const r = a.report;
    return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="tag ${stTag(r.status)}" style="font-size:13px;padding:4px 12px">${esc(r.status)}</span>
      <b>${esc(r.label)}</b>
      <span class="muted sm">${a.trigger === 'manual' ? '手动体检' : '后台自动'} · ${a.date}</span>
    </div>
    <p class="sm" style="margin-top:10px;line-height:1.8">${esc(r.summary)}</p>
    ${(r.findings || []).map(f => `
    <div class="finding"><b>${esc(f.type)}：</b>${esc(f.evidence)}<br><span class="muted">建议：${esc(f.advice)}</span></div>`).join('')}`;
  }

  function pathHtml(gp) {
    return `
    <p class="sm" style="margin-bottom:14px">${esc(gp.summary)}</p>
    <div class="timeline">
      ${(gp.milestones || []).map(ms => `
      <div class="ms">
        <h4>${esc(ms.phase)}<span class="muted sm" style="font-weight:400">${esc(ms.target)}</span></h4>
        ${(ms.abilities || []).map(ab => {
          const cur = Math.max(0, Math.min(100, Number(ab.current) || 0));
          const req = Math.max(0, Math.min(100, Number(ab.required) || 0));
          return `<div class="ab-row">
            <span class="an" title="${esc(ab.name)}">${esc(ab.name)}</span>
            <div class="ab-bar"><i class="cur" style="width:${cur}%"></i><i class="req" style="left:${req}%"></i></div>
            <span class="av">${cur}% → ${req}%</span>
          </div>
          ${ab.gap ? `<div class="sm muted" style="margin:-3px 0 7px 180px">${esc(ab.gap)}</div>` : ''}`;
        }).join('')}
        <div class="ms-actions">${(ms.actions || []).map(a2 => '&middot; ' + esc(a2)).join('<br>')}</div>
      </div>`).join('')}
    </div>
    ${(gp.weeklyFocus && gp.weeklyFocus.length) ? `
    <div style="margin-top:6px">
      <div class="sm muted" style="margin-bottom:8px">本周重点（已同步给每日规划 Agent）</div>
      <div class="chips-row" style="margin:0">${gp.weeklyFocus.map(w => `<span class="chip exam">${esc(w)}</span>`).join('')}</div>
    </div>` : ''}`;
  }

  function importMap(id) {
    const S = Store.state;
    const map = S.knowledgeMaps.find(x => x.id === id);
    if (!map) return;
    const palette = ['#4f6bf0', '#8b5cf6', '#f59e0b', '#10b981', '#e5484d', '#0ea5e9'];
    let cCreated = 0, kCreated = 0;
    (map.directions || []).forEach(d => {
      (d.courses || []).forEach(c => {
        let course = S.courses.find(x => x.name === c.name);
        if (!course) {
          course = { id: Store.uid(), name: c.name, color: palette[S.courses.length % palette.length], examDate: '' };
          S.courses.push(course);
          cCreated++;
        }
        (c.chapters || []).forEach(ch => {
          if (S.kps.some(p => p.courseId === course.id && p.name === ch)) return;
          S.kps.push({
            id: Store.uid(), courseId: course.id,
            chapter: d.name, name: ch, mastery: 0, stage: 0,
            nextReview: null, errCount: 0, errTags: {},
            createdAt: Engine.today(), lastStudy: null
          });
          kCreated++;
        });
      });
    });
    map.imported = true;
    Store.save();
    toast(`已导入：新建 ${cCreated} 门课程、${kCreated} 个知识点（同名自动跳过）`, 'success');
  }

  function openNotif() {
    const S = Store.state;
    const unread = S.assessments.filter(a => a.ts > (S.notifyReadTs || 0));
    const list = unread.length ? unread : S.assessments.slice(0, 1);
    openModal(`
    <div class="modal-head">通知中心</div>
    <div class="modal-body">
      ${list.length ? list.map(a => `
      <div class="notif-item">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="tag ${stTag(a.report.status)}">${esc(a.report.status)}</span>
          <b class="sm">${esc(a.report.label)}</b>
          <span class="grow"></span><span class="muted sm">${a.date}</span>
        </div>
        <div class="sm" style="margin-top:6px;line-height:1.7">${esc(a.report.summary)}</div>
        ${(a.report.findings || []).slice(0, 3).map(f => `
        <div class="finding"><b>${esc(f.type)}：</b>${esc(f.evidence)} → ${esc(f.advice)}</div>`).join('')}
      </div>`).join('') : '<div class="empty">暂无通知。日常使用积累行为数据后，Agent 会自动体检。</div>'}
    </div>
    <div class="modal-foot">
      ${unread.length ? '<button class="btn ghost sm" data-act="mark-read">全部标记已读</button>' : ''}
      <button class="btn primary sm" data-act="modal-x">关闭</button>
    </div>`);
  }

  function openMapGenModal() {
    openModal(`
    <div class="modal-head">AI 生成知识地图</div>
    <form id="f-map-gen">
      <div class="modal-body">
        <div class="grid2">
          <div class="field"><label>专业名称</label><input name="major" required placeholder="如：数据科学"></div>
          <div class="field"><label>年级</label>
            <select name="grade">${['大一', '大二', '大三', '大四'].map(g => `<option>${g}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>补充要求（选填）</label><input name="extra" placeholder="如：偏人工智能方向"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">生成</button>
      </div>
    </form>`);
  }

  function openMapParseModal() {
    openModal(`
    <div class="modal-head">粘贴培养方案解析</div>
    <form id="f-map-parse">
      <div class="modal-body">
        <div class="field"><label>方案名称（选填）</label><input name="major" placeholder="如：XX大学 数据科学培养方案"></div>
        <div class="field"><label>方案文本（从教务系统复制，最长取前6000字）</label>
          <textarea name="text" rows="9" required placeholder="把培养方案的课程设置部分粘贴到这里…"></textarea></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">解析</button>
      </div>
    </form>`);
  }

  function vGrowth() {
    const S = Store.state;
    const last = S.assessments[0];

    const healthCard = `
    <div class="card">
      <div class="card-head">
        <h3>学习体检</h3>
        ${last ? `<span class="muted sm">上次：${last.date}</span>` : ''}
        <span class="grow"></span>
        <button class="btn primary sm" data-act="assess-now">立即体检</button>
      </div>
      ${last ? assessHtml(last) : '<div class="empty">还没有体检报告。<br>配置 AI 后点「立即体检」；平时打开网页时 Agent 也会在数据足够时自动体检（每天最多一次，控制 API 成本）。</div>'}
      ${S.assessments.length > 1 ? `
      <details class="report" style="margin-top:10px">
        <summary>历史体检（${S.assessments.length - 1} 次）</summary>
        <div class="rep-body">${S.assessments.slice(1, 6).map(a => `
          <div class="notif-item">
            <b>${a.date}</b> <span class="tag ${stTag(a.report.status)}">${esc(a.report.status)}</span>
            <span class="sm"> ${esc(a.report.label)}</span>
            <div class="sm muted" style="margin-top:4px">${esc(a.report.summary)}</div>
          </div>`).join('')}</div>
      </details>` : ''}
    </div>`;

    const mapsCard = `
    <div class="card">
      <div class="card-head">
        <h3>专业知识地图</h3>
        <span class="grow"></span>
        <select id="tpl-select" style="width:auto;padding:7px 10px">${Object.keys(TEMPLATES).map(k => `<option value="${k}">${k}</option>`).join('')}</select>
        <button class="btn ghost sm" data-act="map-template">用模板</button>
        <button class="btn ghost sm" data-act="map-gen">AI 生成</button>
        <button class="btn ghost sm" data-act="map-parse">解析培养方案</button>
      </div>
      ${S.knowledgeMaps.length ? S.knowledgeMaps.map(mp => `
      <details class="report">
        <summary>${esc(mp.major)}
          ${mp.imported ? '<span class="tag green">已导入</span>' : '<span class="tag gray">未导入</span>'}
        </summary>
        <div class="rep-body">
          ${mapTreeHtml(mp)}
          <div style="display:flex;gap:8px;margin-top:12px">
            ${mp.imported ? '' : `<button class="btn primary sm" data-act="map-import" data-id="${mp.id}">导入为知识树</button>`}
            <button class="mini" data-act="map-del" data-id="${mp.id}">删除地图</button>
          </div>
        </div>
      </details>`).join('') : '<div class="empty">三种方式建立专业地图：内置模板 / AI 按专业生成 / 粘贴学校培养方案原文解析。<br>展开核对无误后，一键导入为可学习的知识树。</div>'}
    </div>`;

    const gp = S.growthPath;
    const pathCard = `
    <div class="card">
      <div class="card-head">
        <h3>个人成长路径</h3>
        <span class="grow"></span>
        ${gp ? `<span class="muted sm">更新于 ${gp.updatedAt}</span>` : ''}
      </div>
      <form id="f-path" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">
        <div class="field grow" style="margin:0;min-width:230px"><label>长期目标</label>
          <input name="goal" value="${gp ? esc(gp.goal) : ''}" placeholder="如：保研到 XX 实验室 / 毕业拿到数据分析 offer"></div>
        <div class="field" style="margin:0"><label>时间跨度</label>
          <select name="horizon">${['本学期', '一学年', '整个大学'].map(h => `<option ${gp && gp.horizon === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
        <button class="btn primary sm" type="submit">${gp ? '重新生成路径' : '生成路径'}</button>
      </form>
      ${gp ? pathHtml(gp) : '<div class="empty">填写目标后，Agent 会结合你各科掌握度倒推里程碑路径；<br>生成的「本周重点」会自动影响每天的今日计划。</div>'}
    </div>`;

    return `
    <div class="page-head">
      <div><h1>成长</h1><div class="sub">学习体检 · 专业知识地图 · 个人成长路径 —— 从记录走向规划</div></div>
    </div>
    ${healthCard}${mapsCard}${pathCard}`;
  }

  const DAYNAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
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
      if (view !== 'tools') return;
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

  function openSchedModal() {
    openModal(`
    <div class="modal-head">添加课程</div>
    <form id="f-sched">
      <div class="modal-body">
        <div class="field"><label>课程名称</label><input name="name" required placeholder="如：高等数学"></div>
        <div class="grid2">
          <div class="field"><label>教师（选填）</label><input name="teacher"></div>
          <div class="field"><label>地点（选填）</label><input name="room"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>星期</label><select name="day">${DAYNAMES.map((d2, i) => `<option value="${i + 1}">${d2}</option>`).join('')}</select></div>
          <div class="field"><label>单双周</label><select name="weeks"><option value="all">每周</option><option value="odd">单周</option><option value="even">双周</option></select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>开始时间</label><input name="start" type="time" value="08:00" required></div>
          <div class="field"><label>结束时间</label><input name="end" type="time" value="09:40" required></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">保存</button>
      </div>
    </form>`);
  }

  function openCdModal() {
    openModal(`
    <div class="modal-head">添加倒计时</div>
    <form id="f-cd">
      <div class="modal-body">
        <div class="field"><label>名称</label><input name="title" required placeholder="如：英语四级 / 考研初试"></div>
        <div class="field"><label>日期</label><input name="date" type="date" required></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">保存</button>
      </div>
    </form>`);
  }

  function openAbout() {
    const feats = [
      ['📌', '智能今日计划', 'AI 根据薄弱点、复习到期与考试倒计时，每天排出一份"为什么学它"的清单；只剩一小时？告诉 Agent 立刻重排。'],
      ['🧠', '知识树 + 科学复习', '课程→章节→知识点三级体系，打卡自动更新掌握度，按间隔算法（1/2/4/7/15 天）安排下次复习。'],
      ['🔍', '错题本 + AI 诊断', '定位根因、找出概念缺口、给出补救方案，并把薄弱知识点直接排进明天的复习队列。'],
      ['📊', '学习数据全景', '连续天数、时长趋势、各科掌握度、瓶颈 TOP3；AI 周报解读状态，考试风险提前预测。'],
      ['📈', '后台自动体检', '打开网页即自动评估近期学习状态：拖延了吗？时间失衡吗？哪些知识点在反复出错？结论直达通知中心。'],
      ['🗺️', '知识地图 + 成长路径', '选专业生成知识地图（支持粘贴培养方案解析）；设定长期目标，AI 倒推里程碑并反哺每日计划。'],
      ['🧰', '核心四件套', '课程表（支持单双周）· 番茄钟（25 分钟专注循环）· 待办清单 · 考试倒计时，日常刚需一个不少。'],
      ['💬', 'Study Agent 随时问', '"我只有 1 小时该怎么安排？""我最近哪里最薄弱？"右下角唤出对话框，它看得见你的所有数据，答得有理有据。']
    ];
    openModal(`
    <div class="modal-head">学习OS <span class="muted sm" style="font-weight:400">v2.0 · AI 学习决策系统</span></div>
    <div class="modal-body">
      <p class="about-lead">大多数学习 App 只帮你<b>记录</b>——学了几小时、打了几天卡。<br>「学习OS」回答的是更重要的问题：<b>今天到底该学什么？</b></p>
      <p class="sm muted" style="line-height:1.85">每一门课、每个知识点都有掌握度和复习排期；每次错题都被 AI 定位根因；打开网页那一刻，Agent 已读完你的全部学习数据，把今天最值得投入的时间安排好，并告诉你为什么。从每日计划、期末风险预测，到围绕长期目标的成长路径——它是属于你个人的学习操作系统。</p>
      <div class="feat-list">
        ${feats.map(f => `<div class="feat-item"><span class="fi-icon">${f[0]}</span><div><b>${f[1]}</b><div class="sm muted">${f[2]}</div></div></div>`).join('')}
      </div>
      <div class="note" style="margin-top:16px">🔒 隐私承诺：所有数据仅保存在你自己的浏览器中，API Key 本机存放，请求直连官方接口，不经任何第三方服务器。随时一键导出备份。</div>
    </div>
    <div class="modal-foot"><button class="btn primary sm" data-act="modal-x">开始使用</button></div>`);
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

  const VIEWS = { today: vToday, tools: vTools, tree: vTree, mistakes: vMistakes, data: vData, growth: vGrowth, settings: vSettings };

  function render() {
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const dot = $('#api-dot'), lab = $('#api-label');
    dot.classList.toggle('on', AI.ready());
    lab.textContent = AI.ready() ? 'AI 已连接 · ' + Store.state.api.model : 'AI 未配置';
    $('#main').innerHTML = (VIEWS[view] || vToday)();
    renderChat();
  }

  function renderChat() {
    const st = $('#agent-status');
    st.textContent = AI.ready() ? '在线' : '未配置 API';
    const msgs = Store.state.chat.slice(-40);
    $('#chat-msgs').innerHTML = msgs.length
      ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${mdToHtml(m.content)}</div>`).join('')
      : '<div class="msg bot">你好，我是你的 Study Agent。可以问我：「我只有1小时该怎么安排」「我最近哪里最薄弱」「考试风险怎么样」。也可以直接让我重排今天的计划。</div>';
    $('#chat-chips').innerHTML = [
      '我只有1小时，帮我重排今天',
      '我最近最薄弱的地方是什么？',
      '帮我分析一下这周的状态',
      '考试快到了怎么办'
    ].map(t => `<span class="chip" data-ask="${esc(t)}">${esc(t)}</span>`).join('');
    const box = $('#chat-msgs');
    box.scrollTop = box.scrollHeight;
  }

  function onboard() {
    const GOALS = ['保研 · 高绩点', '考研备战', '通过期末', '技能提升', '留学申请'];
    openModal(`
    <div class="modal-head">欢迎来到 学习OS</div>
    <form id="f-onboard">
      <div class="modal-body">
        <p class="muted sm" style="margin-bottom:14px">告诉我你的目标，Study Agent 会据此为你规划每天的学习。所有数据只保存在本机浏览器。</p>
        <div class="field"><label>昵称</label><input name="name" placeholder="怎么称呼你？"></div>
        <div class="field"><label>本学期核心目标</label>
          <select name="goal">${GOALS.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="field"><label>每天大概能学多久（分钟）</label>
          <input name="minutes" type="number" value="120" min="20" step="10"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="onboard-demo">先用示例数据看看</button>
        <button class="btn primary sm" type="submit">开始使用</button>
      </div>
    </form>`);
  }

  function openCheckin(ctxIn) {
    ckCtx = Object.assign({}, ctxIn, { rating: 'good' });
    const p = Engine.kp(ctxIn.kpId);
    openModal(`
    <div class="modal-head">学习打卡 · ${esc(p ? p.name : '')}</div>
    <div class="modal-body">
      <div class="field"><label>这次学得怎么样？</label>
        <div class="seg" id="ck-seg">
          <button type="button" data-r="good" class="on">掌握了</button>
          <button type="button" data-r="ok">有点模糊</button>
          <button type="button" data-r="bad">没学会</button>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label>实际用时（分钟，选填）</label><input id="ck-min" type="number" min="0" placeholder="如 30"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text)">
        <input type="checkbox" id="ck-mk-toggle" style="width:auto">同时记一条错题
      </label>
      <div id="ck-mk-box" style="display:none;margin-top:12px">
        <div class="field"><label>错因标签</label>
          <select id="ck-tag">${['概念不清', '计算失误', '审题错误', '方法不会', '其他'].map(x => `<option>${x}</option>`).join('')}</select>
        </div>
        <div class="field"><label>错题描述（越具体，AI 诊断越准）</label>
          <textarea id="ck-desc" rows="3" placeholder="题目考查什么？你在哪一步卡住了？"></textarea>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost sm" data-act="modal-x">取消</button>
      <button class="btn primary sm" data-act="ck-save">保存打卡</button>
    </div>`);
  }

  function setRate(r) {
    ckCtx.rating = r;
    $$('#ck-seg button').forEach(b => b.classList.toggle('on', b.dataset.r === r));
  }

  function saveCheckin() {
    if (!ckCtx) return;
    const min = Number($('#ck-min').value) || 0;
    const delta = Engine.checkin(ckCtx.kpId, ckCtx.rating, min);
    if ($('#ck-mk-toggle').checked) {
      Engine.addMistake(ckCtx.kpId, $('#ck-tag').value, $('#ck-desc').value.trim());
      toast('已记录错题，该知识点明天进入复习队列');
    }
    if (ckCtx.itemId) {
      const it = Store.state.planItems.find(i => i.id === ckCtx.itemId);
      if (it) it.done = true;
    } else {
      const it = Store.state.planItems.find(i => !i.done && i.kpId === ckCtx.kpId);
      if (it) it.done = true;
    }
    Store.save();
    closeModal();
    toast(`打卡完成，掌握度 ${delta >= 0 ? '+' : ''}${delta}%`, 'success');
  }

  function openReplan() {
    openModal(`
    <div class="modal-head">调整今天的计划</div>
    <form id="f-replan">
      <div class="modal-body">
        <div class="chips-row">
          ${['我只有1小时', '有点累，安排轻松些', '重点攻克薄弱知识点'].map(t2 =>
            `<span class="chip" style="cursor:pointer" data-fill="${t2}">${t2}</span>`).join('')}
        </div>
        <div class="field"><label>告诉 Agent 你的情况</label>
          <textarea id="replan-text" rows="3" placeholder="例如：我今天只有1小时，而且高数下周就考了…"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">重新生成</button>
      </div>
    </form>`);
  }

  function openTaskModal() {
    const groups = Store.state.courses.map(c => {
      const ks = Store.state.kps.filter(p => p.courseId === c.id);
      if (!ks.length) return '';
      return `<optgroup label="${esc(c.name)}">${ks.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`;
    }).join('');
    openModal(`
    <div class="modal-head">手动添加任务</div>
    <form id="f-task">
      <div class="modal-body">
        <div class="field"><label>任务名称</label><input name="title" required placeholder="如：整理线代笔记"></div>
        <div class="grid2">
          <div class="field"><label>预计时长（分钟）</label><input name="minutes" type="number" min="5" value="25"></div>
          <div class="field"><label>关联知识点（可选）</label>
            <select name="kp"><option value="">不关联</option>${groups}</select></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">添加</button>
      </div>
    </form>`);
  }

  function openCourseModal() {
    openModal(`
    <div class="modal-head">新建课程</div>
    <form id="f-course">
      <div class="modal-body">
        <div class="field"><label>课程名称</label><input name="name" required placeholder="如：高等数学"></div>
        <div class="grid2">
          <div class="field"><label>颜色标识</label>
            <select name="color">${['#4f6bf0', '#8b5cf6', '#f59e0b', '#10b981', '#e5484d', '#0ea5e9'].map(c =>
              `<option value="${c}" ${c === '#4f6bf0' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>考试日期（可选）</label><input name="exam" type="date"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">创建</button>
      </div>
    </form>`);
  }

  function openKpModal(courseId) {
    const chapters = [...new Set(Store.state.kps.filter(p => p.courseId === courseId).map(p => p.chapter).filter(Boolean))];
    openModal(`
    <div class="modal-head">新增知识点 · ${esc(Engine.courseName(courseId))}</div>
    <form id="f-kp" data-course="${courseId}">
      <div class="modal-body">
        <div class="field"><label>所属章节</label>
          <input name="chapter" list="dl-chapters" placeholder="如：极限与连续">
          <datalist id="dl-chapters">${chapters.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>知识点名称</label><input name="name" required placeholder="如：无穷小的比较"></div>
        <div class="field"><label>初始自评</label>
          <select name="level">
            <option value="0">还没学过</option>
            <option value="30" selected>学过一点</option>
            <option value="60">比较熟悉</option>
            <option value="85">很扎实</option>
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">添加</button>
      </div>
    </form>`);
  }

  function fillKpSelect(courseId, selId) {
    const list = Store.state.kps.filter(p => p.courseId === courseId);
    $('#f-mk-kp').innerHTML = list.length
      ? list.map(p => `<option value="${p.id}" ${selId === p.id ? 'selected' : ''}>${esc((p.chapter ? p.chapter + ' · ' : '') + p.name)}</option>`).join('')
      : '<option value="">（该课程暂无知识点）</option>';
  }

  function openMistakeModal(preKpId) {
    const S = Store.state;
    openModal(`
    <div class="modal-head">记录错题</div>
    <form id="f-mistake">
      <div class="modal-body">
        <div class="grid2">
          <div class="field"><label>课程</label>
            <select id="f-mk-course">${S.courses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>知识点</label><select name="kp" id="f-mk-kp"></select></div>
        </div>
        <div class="field"><label>错因标签</label>
          <select name="tag">${['概念不清', '计算失误', '审题错误', '方法不会', '其他'].map(t2 => `<option>${t2}</option>`).join('')}</select>
        </div>
        <div class="field"><label>错题描述</label>
          <textarea name="desc" rows="3" placeholder="题目考查什么？你在哪一步卡住了？（写清楚点，AI 才能诊断准）"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">保存</button>
      </div>
    </form>`);
    if (preKpId) {
      const p = Engine.kp(preKpId);
      if (p) $('#f-mk-course').value = p.courseId;
    }
    if (!$('#f-mk-course').value && S.courses.length === 0) {}
    fillKpSelect($('#f-mk-course').value || (S.courses[0] && S.courses[0].id), preKpId);
  }

  async function doGen(constraint) {
    if (genBusy) return;
    genBusy = true;
    try {
      if (!AI.ready()) {
        Engine.buildRulePlan();
        Store.save();
        toast('未接入 AI，已按规则生成。在设置中配置 API Key 可解锁智能规划');
      } else {
        toast(constraint ? '正在按你的情况重新规划…' : '正在生成今日计划…');
        const plan = await AI.genPlan(constraint || '');
        Engine.applyPlan(plan, 'ai');
        Store.save();
        toast('今日计划已生成', 'success');
      }
    } catch (e) {
      toast('AI 生成失败：' + e.message + '，已回退规则引擎', 'error');
      Engine.buildRulePlan();
      Store.save();
    } finally {
      genBusy = false;
    }
  }

  function toggleItem(id) {
    const it = Store.state.planItems.find(i => i.id === id);
    if (!it) return;
    if (!it.done && it.kpId) { openCheckin({ itemId: id, kpId: it.kpId }); return; }
    it.done = !it.done;
    Store.logEvent('task_done', it.kpId || '', { title: it.title });
    Store.save();
  }

  async function diag(id) {
    const m = Store.state.mistakes.find(x => x.id === id);
    if (!m || aiBusy) return;
    if (!guardAI()) return;
    aiBusy = true;
    toast('AI 正在分析这道错题…');
    try {
      const r = await AI.analyzeMistake(m);
      m.analysis = { reason: r.reason || '', gap: r.gap || '', advice: r.advice || '', severity: r.severity || '' };
      Store.save();
      toast('诊断完成', 'success');
    } catch (e) {
      toast('诊断失败：' + e.message, 'error');
    } finally { aiBusy = false; }
  }

  function reviewTomorrow(id) {
    const m = Store.state.mistakes.find(x => x.id === id);
    if (!m) return;
    const p = Engine.kp(m.kpId);
    if (p) { p.stage = 0; p.nextReview = Engine.addDays(Engine.today(), 1); }
    Store.save();
    toast('已加入明天的复习队列', 'success');
  }

  async function weekly() {
    if (aiBusy || !guardAI()) return;
    aiBusy = true;
    toast('AI 正在撰写本周报告…');
    try {
      const md = await AI.weeklyReport();
      Store.state.reports.unshift({ id: Store.uid(), type: 'weekly', title: '本周学习报告', content: md, date: Engine.today() });
      Store.save();
      toast('报告已生成', 'success');
    } catch (e) {
      toast('失败：' + e.message, 'error');
    } finally { aiBusy = false; }
  }

  async function risk() {
    if (aiBusy || !guardAI()) return;
    aiBusy = true;
    toast('AI 正在评估考试风险…');
    try {
      const risks = await AI.predictRisk();
      Store.state.reports.unshift({
        id: Store.uid(), type: 'risk', title: '考试风险预测',
        content: JSON.stringify(risks), date: Engine.today()
      });
      Store.save();
      toast('预测完成', 'success');
    } catch (e) {
      toast('失败：' + e.message, 'error');
    } finally { aiBusy = false; }
  }

  async function testApi() {
    const api = Store.state.api;
    api.base = $('#f-base').value.trim();
    api.key = $('#f-key').value.trim();
    api.model = $('#f-model').value.trim();
    try {
      localStorage.setItem('study_os_v1', JSON.stringify(Store.state));
    } catch (e) {}
    toast('测试连接中…');
    try {
      await AI.test();
      toast('连接成功，配置有效', 'success');
      render();
    } catch (e) {
      toast('连接失败：' + e.message, 'error');
    }
  }

  async function sendChat(forcedText) {
    const inp = $('#chat-input');
    const t = forcedText || inp.value.trim();
    if (!t || chatting) return;
    if (!AI.ready()) {
      toast('请先在「设置」中配置 AI 接口', 'error');
      return;
    }
    chatting = true;
    inp.value = '';
    Store.state.chat.push({ role: 'user', content: t });
    renderChat();
    $('#chat-msgs').insertAdjacentHTML('beforeend', '<div class="msg bot" id="chat-typing">思考中…</div>');
    const box = $('#chat-msgs');
    box.scrollTop = box.scrollHeight;
    try {
      const replanIntent = /(重新?(规划|排)|安排.{0,4}今天|重排|只有\s*\d+\s*(小时|分钟)|只剩\s*\d+\s*(小时|分钟))/.test(t);
      let reply;
      if (replanIntent) {
        const plan = await AI.genPlan(t);
        Engine.applyPlan(plan, 'ai');
        reply = '已按你的情况重排今日计划：\n'
          + plan.items.map(i => `- ${i.title}（${i.minutes}min）：${i.reason}`).join('\n')
          + (plan.note ? `\n\n${plan.note}` : '');
        Store.save();
      } else {
        reply = await AI.ask(t);
        Store.save();
      }
      Store.state.chat.push({ role: 'assistant', content: reply });
      Store.save();
    } catch (e) {
      Store.state.chat.push({ role: 'assistant', content: '请求失败：' + e.message });
      Store.save();
    } finally {
      chatting = false;
      renderChat();
    }
  }

  document.addEventListener('click', async e => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) { closeModal(); return; }
    const el = e.target.closest('[data-fill]');
    if (el) {
      const inp = $('#replan-text');
      if (inp) inp.value = el.dataset.fill;
      return;
    }
    const chip = e.target.closest('[data-ask]');
    if (chip) { sendChat(chip.dataset.ask); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    switch (act) {
      case 'nav':
        view = btn.dataset.view;
        render();
        break;
      case 'modal-x': closeModal(); break;
      case 'chat-open': $('#drawer').classList.add('open'); renderChat(); break;
      case 'chat-close': $('#drawer').classList.remove('open'); break;
      case 'chat-clear': Store.state.chat = []; Store.save(); break;
      case 'gen-plan': await doGen(''); break;
      case 'replan-open': openReplan(); break;
      case 'task-add': openTaskModal(); break;
      case 'item-toggle': toggleItem(id); break;
      case 'ck-rate': setRate(btn.dataset.r); break;
      case 'ck-save': saveCheckin(); break;
      case 'course-add': openCourseModal(); break;
      case 'course-del':
        if (confirm('删除该课程及其所有知识点？')) {
          const c = Engine.course(id);
          Store.state.courses = Store.state.courses.filter(x => x.id !== id);
          Store.state.kps = Store.state.kps.filter(p => p.courseId !== id);
          Store.save();
          toast(`已删除「${c ? c.name : ''}」`, 'success');
        }
        break;
      case 'kp-add': openKpModal(btn.dataset.course); break;
      case 'kp-checkin': openCheckin({ kpId: id }); break;
      case 'kp-mistake': openMistakeModal(id); break;
      case 'kp-del':
        if (confirm('删除该知识点？')) {
          Store.state.kps = Store.state.kps.filter(p => p.id !== id);
          Store.save();
        }
        break;
      case 'mk-add': openMistakeModal(); break;
      case 'mk-diag': await diag(id); break;
      case 'mk-review': reviewTomorrow(id); break;
      case 'mk-resolve': {
        const m = Store.state.mistakes.find(x => x.id === id);
        if (m) { m.done = !m.done; Store.save(); }
        break;
      }
      case 'mk-del':
        if (confirm('删除这条错题？')) {
          Store.state.mistakes = Store.state.mistakes.filter(x => x.id !== id);
          Store.save();
        }
        break;
      case 'report-week': await weekly(); break;
      case 'report-risk': await risk(); break;
      case 'api-test': await testApi(); break;
      case 'notif-open': openNotif(); break;
      case 'about-open': openAbout(); break;
      case 'mark-read':
        Store.state.notifyReadTs = Date.now();
        Store.save();
        closeModal();
        break;
      case 'assess-now':
        if (aiBusy || !guardAI()) break;
        aiBusy = true;
        toast('Agent 正在体检…');
        try {
          await Assessor.maybeRun(true);
          toast('体检完成', 'success');
        } catch (e) { toast(e.message, 'error'); }
        finally { aiBusy = false; }
        break;
      case 'apply-adjust': {
        const la = Store.state.assessments[0];
        await doGen(la ? '参考最近学习体检的建议：' + (la.report.adjustReason || '') : '');
        break;
      }
      case 'map-template': {
        const sel = $('#tpl-select');
        const k = sel && sel.value ? sel.value : Object.keys(TEMPLATES)[0];
        Store.state.knowledgeMaps.unshift(Object.assign(
          { id: Store.uid(), createdAt: Engine.today(), imported: false },
          JSON.parse(JSON.stringify(TEMPLATES[k]))
        ));
        Store.save();
        toast(`「${k}」模板已加入，展开核对后可导入`, 'success');
        break;
      }
      case 'map-gen': openMapGenModal(); break;
      case 'map-parse': openMapParseModal(); break;
      case 'map-import': importMap(id); break;
      case 'map-del':
        if (confirm('删除这张知识地图？')) {
          Store.state.knowledgeMaps = Store.state.knowledgeMaps.filter(x => x.id !== id);
          Store.save();
        }
        break;
      case 'pomo-toggle':
        if (pomo.running) {
          pomo.remain = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
          pomo.running = false;
        } else {
          pomo.endAt = Date.now() + pomo.remain * 1000;
          pomo.running = true;
          ensurePomoTimer();
        }
        render();
        break;
      case 'pomo-reset':
        pomo.running = false;
        pomo.mode = 'focus';
        pomo.remain = pomoDef.focus;
        render();
        break;
      case 'sched-tab':
        schedTab = btn.dataset.tab;
        render();
        break;
      case 'sched-add': openSchedModal(); break;
      case 'sched-del':
        if (confirm('删除这门课？')) {
          Store.state.schedule = Store.state.schedule.filter(x => x.id !== id);
          Store.save();
        }
        break;
      case 'cd-add': openCdModal(); break;
      case 'cd-del':
        Store.state.countdowns = Store.state.countdowns.filter(x => x.id !== id);
        Store.save();
        break;
      case 'todo-toggle': {
        const td = Store.state.todos.find(x => x.id === id);
        if (td) {
          td.done = !td.done;
          Store.logEvent('todo_done', '', { text: td.text });
          Store.save();
        }
        break;
      }
      case 'todo-del':
        Store.state.todos = Store.state.todos.filter(x => x.id !== id);
        Store.save();
        break;
      case 'export':
        Store.exportData();
        toast('备份文件已下载', 'success');
        break;
      case 'import-btn': $('#import-file').click(); break;
      case 'demo-load':
        if (confirm('将覆盖当前所有学习数据，继续？')) {
          Store.seedDemo();
          Store.save();
          toast('示例数据已载入，去各页面逛逛吧', 'success');
        }
        break;
      case 'wipe':
        if (confirm('确定清空全部学习数据？此操作不可恢复！')) {
          Store.state = {
            profile: { name: '', goal: '', major: '', dailyMinutes: 180 },
            api: Store.state.api,
            courses: [], kps: [], logs: [], mistakes: [],
            planDate: null, planItems: [], planNote: '',
            reports: [], chat: []
          };
          Store.save();
          onboard();
          toast('已清空学习数据', 'success');
        }
        break;
      case 'onboard-demo':
        Store.seedDemo();
        Store.save();
        closeModal();
        toast('示例数据已载入', 'success');
        break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.chg === 'exam-date') {
      const c = Engine.course(t.dataset.id);
      if (c) { c.examDate = t.value; Store.save(); toast('考试日期已更新'); }
    } else if (t.dataset.chg === 'mk-filter') {
      mkFilter = t.value;
      render();
    } else if (t.dataset.chg === 'semester-start') {
      Store.state.profile.semesterStart = t.value;
      Store.save();
      toast('学期起点已更新，单双周将自动识别');
    } else if (t.id === 'api-preset') {
      const pr = AI.PRESETS[t.value];
      if (pr) {
        $('#f-base').value = pr.base;
        $('#f-model').value = pr.model;
        Store.state.api.preset = t.value;
      }
    } else if (t.id === 'ck-mk-toggle') {
      $('#ck-mk-box').style.display = t.checked ? '' : 'none';
    } else if (t.id === 'f-mk-course') {
      fillKpSelect(t.value);
    } else if (t.id === 'import-file') {
      const f = t.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          Store.importData(rd.result);
          toast('导入成功', 'success');
        } catch (err) {
          toast('导入失败：' + err.message, 'error');
        }
      };
      rd.readAsText(f);
      t.value = '';
    }
  });

  document.addEventListener('submit', async e => {
    const f = e.target;
    if (!['f-profile', 'f-api', 'f-replan', 'f-task', 'f-course', 'f-kp', 'f-mistake', 'f-onboard', 'f-todo', 'f-sched', 'f-cd', 'chat-form'].includes(f.id)) return;
    e.preventDefault();
    const d = new FormData(f);
    switch (f.id) {
      case 'f-profile':
        Object.assign(Store.state.profile, {
          name: String(d.get('name') || '').trim(),
          major: String(d.get('major') || '').trim(),
          goal: d.get('goal'),
          dailyMinutes: Math.max(20, Number(d.get('dailyMinutes')) || 120)
        });
        Store.save();
        toast('资料已保存', 'success');
        break;
      case 'f-api':
        Object.assign(Store.state.api, {
          base: $('#f-base').value.trim(),
          key: $('#f-key').value.trim(),
          model: $('#f-model').value.trim()
        });
        Store.save();
        toast('配置已保存，可点击「测试连接」验证', 'success');
        break;
      case 'f-replan': {
        const txt = $('#replan-text').value.trim();
        closeModal();
        await doGen(txt);
        break;
      }
      case 'f-task':
        Store.state.planItems.push({
          id: Store.uid(),
          kpId: d.get('kp') || '',
          title: String(d.get('title') || '学习任务').trim(),
          minutes: Math.max(5, Number(d.get('minutes')) || 25),
          tag: '练习', reason: '手动添加', done: false, source: 'manual'
        });
        Store.state.planDate = Engine.today();
        Store.save();
        closeModal();
        toast('任务已添加', 'success');
        break;
      case 'f-course': {
        const name = String(d.get('name') || '').trim();
        if (!name) { toast('请填写课程名', 'error'); return; }
        Store.state.courses.push({ id: Store.uid(), name, color: d.get('color'), examDate: d.get('exam') || '' });
        Store.save();
        closeModal();
        toast('课程已创建', 'success');
        break;
      }
      case 'f-kp': {
        const name = String(d.get('name') || '').trim();
        if (!name) { toast('请填写知识点名', 'error'); return; }
        const lvl = Number(d.get('level')) || 0;
        Store.state.kps.push({
          id: Store.uid(),
          courseId: f.dataset.course,
          chapter: String(d.get('chapter') || '').trim() || '未分组',
          name, mastery: lvl,
          stage: lvl >= 60 ? 2 : lvl >= 30 ? 1 : 0,
          nextReview: null,
          errCount: 0, errTags: {},
          createdAt: Engine.today(), lastStudy: null
        });
        Store.save();
        closeModal();
        toast('知识点已添加', 'success');
        break;
      }
      case 'f-mistake': {
        const kpId = d.get('kp');
        if (!kpId) { toast('请选择知识点', 'error'); return; }
        Engine.addMistake(kpId, d.get('tag'), String(d.get('desc') || '').trim());
        Store.save();
        closeModal();
        toast('错题已记录，该知识点明天进入复习队列', 'success');
        break;
      }
      case 'f-onboard':
        Object.assign(Store.state.profile, {
          name: String(d.get('name') || '').trim() || '同学',
          goal: d.get('goal'),
          dailyMinutes: Math.max(20, Number(d.get('minutes')) || 120)
        });
        Store.save();
        closeModal();
        toast('欢迎开始使用，先去「知识树」搭建你的第一棵树吧', 'success');
        break;
      case 'f-map-gen': {
        if (!guardAI()) break;
        closeModal();
        aiBusy = true;
        toast('正在生成知识地图…');
        try {
          const r = await AI.genKnowledgeMap(String(d.get('major')).trim(), d.get('grade'), String(d.get('extra') || '').trim());
          Store.state.knowledgeMaps.unshift({
            id: Store.uid(), major: r.major || String(d.get('major')).trim(),
            directions: r.directions || [], createdAt: Engine.today(), imported: false
          });
          view = 'growth';
          Store.save();
          toast('地图已生成，请展开核对后导入', 'success');
        } catch (e) { toast('生成失败：' + e.message, 'error'); }
        finally { aiBusy = false; }
        break;
      }
      case 'f-map-parse': {
        if (!guardAI()) break;
        const txt = String(d.get('text') || '').trim();
        if (!txt) { toast('请粘贴方案文本', 'error'); break; }
        closeModal();
        aiBusy = true;
        toast('正在解析培养方案…');
        try {
          const r = await AI.parsePlanText(txt, String(d.get('major') || '').trim());
          Store.state.knowledgeMaps.unshift({
            id: Store.uid(), major: r.major || String(d.get('major') || '').trim() || '培养方案',
            directions: r.directions || [], createdAt: Engine.today(), imported: false
          });
          view = 'growth';
          Store.save();
          toast('解析完成，请展开核对后导入', 'success');
        } catch (e) { toast('解析失败：' + e.message, 'error'); }
        finally { aiBusy = false; }
        break;
      }
      case 'f-path': {
        const goal = String(d.get('goal') || '').trim();
        if (!goal) { toast('请填写长期目标', 'error'); break; }
        if (!guardAI()) break;
        aiBusy = true;
        toast('Agent 正在规划成长路径…');
        try {
          const r = await AI.genGrowthPath(goal, d.get('horizon'));
          Store.state.growthPath = {
            goal, horizon: d.get('horizon'), updatedAt: Engine.today(),
            summary: r.summary || '', milestones: r.milestones || [], weeklyFocus: r.weeklyFocus || []
          };
          Store.save();
          toast('成长路径已生成，「本周重点」将影响每日计划', 'success');
        } catch (e) { toast('生成失败：' + e.message, 'error'); }
        finally { aiBusy = false; }
        break;
      }
      case 'f-todo':
        Store.state.todos.push({
          id: Store.uid(),
          text: String(d.get('text') || '').trim(),
          date: d.get('date') || '',
          priority: d.get('priority') || 'mid',
          done: false, createdAt: Date.now()
        });
        Store.save();
        toast('待办已添加', 'success');
        break;
      case 'f-sched': {
        const palette = ['#4f6bf0', '#8b5cf6', '#f59e0b', '#10b981', '#e5484d', '#0ea5e9'];
        const s2 = Store.state.schedule;
        s2.push({
          id: Store.uid(),
          name: String(d.get('name')).trim(),
          teacher: String(d.get('teacher') || '').trim(),
          room: String(d.get('room') || '').trim(),
          day: Number(d.get('day')),
          start: d.get('start'), end: d.get('end'),
          weeks: d.get('weeks'),
          color: palette[s2.length % palette.length]
        });
        Store.save();
        closeModal();
        toast('课程已加入课表', 'success');
        break;
      }
      case 'f-cd':
        Store.state.countdowns.push({
          id: Store.uid(),
          title: String(d.get('title')).trim(),
          date: d.get('date')
        });
        Store.save();
        closeModal();
        toast('倒计时已添加', 'success');
        break;
      case 'chat-form':
        sendChat();
        break;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      $('#drawer').classList.remove('open');
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-input') {
      e.preventDefault();
      sendChat();
    }
  });

  function init() {
    if (!Store.state.profile.name) onboard();
    render();
    setTimeout(async () => {
      try {
        const ran = await Assessor.maybeRun(false);
        if (ran) {
          render();
          toast('Study Agent 刚完成一次后台学习体检，见「通知」', 'success');
        }
      } catch (e) {}
    }, 1500);
  }

  init();
  window.App = { render };

  return { render };
})();
