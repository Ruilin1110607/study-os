const Store = (() => {
  const KEY = 'study_os_v1';
  const uid = () => Util.uid();
  const dstr = d => Util.dstr(d);

  function blank() {
    return {
      schemaVersion: 3,
      profile: { name: '', goal: '', major: '', dailyMinutes: 180, semesterStart: '' },
      api: { preset: '', base: '', key: '', model: '' },
      courses: [],
      kps: [],
      logs: [],
      mistakes: [],
      planDate: null,
      planItems: [],
      planNote: '',
      planGenTs: 0,
      events: [],
      profileSnapshots: [],
      assessments: [],
      knowledgeMaps: [],
      growthPath: null,
      notifyReadTs: 0,
      reports: [],
      chat: [],
      schedule: [],
      todos: [],
      countdowns: [],
      pomodoroLog: {},
      questions: [],
      attempts: []
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.schemaVersion || parsed.schemaVersion < 2) backfillV2(parsed);
        if (parsed.schemaVersion < 3) parsed.schemaVersion = 3;
        if (!parsed.api) parsed.api = blank().api;
        if (parsed.api.preset === 'pollinations') {
          parsed.api = Object.assign(blank().api, { key: parsed.api.key || '' });
        }
        return Object.assign(blank(), parsed);
      }
    } catch (e) {}
    return blank();
  }

  function backfillV2(raw) {
    const tOf = dateStr => {
      const d = new Date((dateStr || '') + 'T12:00:00');
      return isNaN(d.getTime()) ? Date.now() : d.getTime();
    };
    const ev = [];
    (raw.logs || []).forEach(l => ev.push({
      id: 'bf' + l.id, ts: tOf(l.date), date: l.date,
      type: 'checkin', kpId: l.kpId, payload: { rating: l.rating, minutes: l.minutes || 0 }
    }));
    (raw.mistakes || []).forEach(m => ev.push({
      id: 'bf' + m.id, ts: tOf(m.date), date: m.date,
      type: 'mistake', kpId: m.kpId, payload: { tag: m.tag }
    }));
    raw.events = (raw.events || []).concat(ev);
    raw.schemaVersion = 2;
    return raw;
  }

  function prune() {
    const s = state;
    if (s.events.length > 2000) s.events = s.events.slice(-2000);
    const cut = Date.now() - 90 * 86400000;
    s.profileSnapshots = s.profileSnapshots.filter(x => new Date(x.date + 'T23:59:59').getTime() >= cut);
    if (s.assessments.length > 24) s.assessments = s.assessments.slice(0, 24);
    if (s.reports.length > 24) s.reports = s.reports.slice(0, 24);
    if ((s.chat || []).length > 60) s.chat = s.chat.slice(-60);
    if ((s.questions || []).length > 400) s.questions = s.questions.slice(-400);
    if ((s.attempts || []).length > 1200) s.attempts = s.attempts.slice(-1200);
  }

  function save() {
    prune();
    if (transport === 'api') schedulePush();
    else { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
    if (window.App && App.render) App.render();
  }

  // ---- 云同步适配器（B2）：检测后端 → 有则走 API，无则回退 localStorage ----
  let transport = 'local';
  let pushTimer = null;
  let apiBase = '';   // 测试钩子：node 环境可指向 http://localhost:8643，浏览器保持相对路径

  const Auth = {
    tok() { try { return localStorage.getItem('study_os_token') || ''; } catch (e) { return ''; } },
    set(t) { try { localStorage.setItem('study_os_token', t); } catch (e) {} },
    clear() { try { localStorage.removeItem('study_os_token'); } catch (e) {} }
  };

  async function apiFetch(path, opt) {
    opt = opt || {};
    const headers = { 'Content-Type': 'application/json' };
    const t = Auth.tok();
    if (t) headers.Authorization = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(apiBase + path, {
        method: opt.method || 'GET',
        headers,
        body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined
      });
    } catch (e) {
      const er = new Error('无法连接服务器');
      er.status = 0;
      throw er;
    }
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = await res.json();
        if (typeof j.detail === 'string') msg = j.detail;
      } catch (e) {}
      const er = new Error(msg);
      er.status = res.status;
      throw er;
    }
    return res.json();
  }

  async function detectTransport() {
    try {
      const r = await fetch(apiBase + '/api/health', { method: 'GET' });
      if (!r.ok) { transport = 'local'; return transport; }
      // 静态托管（如 Cloudflare Pages）会对未知路径回退 index.html 且返回 200，
      // 必须校验响应体确实是本服务健康数据，否则误判为云模式
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      transport = (j && j.ok === true && j.service === 'studyos') ? 'api' : 'local';
    } catch (e) { transport = 'local'; }
    return transport;
  }

  function hydrate(obj) { state = Object.assign(blank(), obj || {}); }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      pushTimer = null;
      try { await apiFetch('/api/state', { method: 'POST', body: state }); }
      catch (e) { console.warn('[StudyOS] 同步失败：', e.message); }
    }, 600);
  }

  function logEvent(type, kpId, payload) {
    try {
      state.events.push({ id: uid(), ts: Date.now(), date: dstr(new Date()), type, kpId: kpId || '', payload: payload || {} });
    } catch (e) {}
  }

  // 试用数据的默认画像（用户已有资料时逐字段覆盖）
  const DEMO_PROFILE = { name: '同学', goal: '通过期末', major: '', dailyMinutes: 180 };

  function seedDemo() {
    const off = n => Engine.addDays(Engine.today(), n);
    const prevApi = state && state.api ? state.api : null;
    const prevProfile = state && state.profile ? state.profile : null;
    const s = blank();
    if (prevApi) s.api = prevApi;
    s.profile = { name: DEMO_PROFILE.name, goal: DEMO_PROFILE.goal, major: DEMO_PROFILE.major, dailyMinutes: DEMO_PROFILE.dailyMinutes, semesterStart: off(-35) };
    if (prevProfile) {
      ['name', 'goal', 'major', 'dailyMinutes', 'semesterStart'].forEach(k => {
        if (prevProfile[k]) s.profile[k] = prevProfile[k];
      });
    }
    s.courses = [
      { id: 'c1', name: '高等数学', color: '#4f6bf0', examDate: off(37) },
      { id: 'c2', name: '线性代数', color: '#8b5cf6', examDate: off(52) },
      { id: 'c3', name: 'C语言程序设计', color: '#f59e0b', examDate: off(45) },
      { id: 'c4', name: 'Python 与数据分析', color: '#10b981', examDate: '' }
    ];
    const mk = (courseId, chapter, name, mastery, stage, next, errCount, errTags) => ({
      id: uid(), courseId, chapter, name, mastery,
      stage, nextReview: next, errCount: errCount || 0, errTags: errTags || {},
      createdAt: off(-20), lastStudy: ''
    });
    s.kps = [
      mk('c1', '极限与连续', '数列与函数极限', 72, 2, off(2)),
      mk('c1', '极限与连续', '无穷小与无穷大的比较', 43, 1, off(0), 2, { 概念不清: 2 }),
      mk('c1', '导数与微分', '求导法则与应用', 81, 3, off(6)),
      mk('c1', '不定积分', '积分基本方法', 38, 1, off(1), 1, { 方法不会: 1 }),
      mk('c2', '矩阵与行列式', '矩阵运算与逆矩阵', 66, 2, off(3)),
      mk('c2', '特征值', '特征值与特征向量', 35, 1, off(0), 1, { 概念不清: 1 }),
      mk('c3', '控制流程', '循环结构与函数综合', 58, 1, off(1), 1, { 计算失误: 1 }),
      mk('c4', '数据处理', 'Pandas 基础操作', 28, 0, null)
    ];
    const log = (d, i, rating, minutes) => ({ id: uid(), date: off(-d), kpId: s.kps[i].id, rating, minutes });
    s.logs = [
      log(1, 2, 'good', 50), log(2, 0, 'good', 45), log(3, 4, 'ok', 30),
      log(4, 1, 'bad', 40), log(5, 6, 'ok', 55), log(6, 0, 'good', 60)
    ];
    s.mistakes = [
      { id: uid(), kpId: s.kps[1].id, tag: '概念不清', desc: '做极限比较题目时，对高阶无穷小在什么条件下可以直接代入换算判断混乱。', date: off(2), analysis: null },
      { id: uid(), kpId: s.kps[5].id, tag: '概念不清', desc: '把特征向量的定义和特征值的性质弄混，计算 AX=λX 时方向搞反了。', date: off(1), analysis: null }
    ];
    const evs = [];
    const DELTA = { good: 10, ok: 4, bad: -12 };
    s.logs.forEach((l, i) => evs.push({
      id: uid(), ts: new Date(l.date + 'T19:00:00').getTime(), date: l.date,
      type: 'checkin', kpId: l.kpId,
      payload: { rating: l.rating, minutes: l.minutes, delta: DELTA[l.rating] || 0 }
    }));
    s.mistakes.forEach(m => evs.push({
      id: uid(), ts: new Date(m.date + 'T21:00:00').getTime(), date: m.date,
      type: 'mistake', kpId: m.kpId, payload: { tag: m.tag }
    }));

    // 今日计划（含已完成/手动/AI 示例）
    s.planDate = off(0);
    s.planGenTs = Date.now();
    s.planNote = '试用数据：由 Learning Intelligence 按掌握度 × 遗忘风险 × 考试紧迫生成。';
    s.planItems = [
      { id: uid(), kpId: s.kps[1].id, title: '高等数学 · 无穷小与无穷大的比较', minutes: 35, tag: '到期复习', reason: '优先级 78：掌握度低（43%）、累计错题 2 次', done: false, source: 'rule' },
      { id: uid(), kpId: s.kps[3].id, title: '高等数学 · 积分基本方法', minutes: 30, tag: '薄弱推进', reason: '优先级 71：开始遗忘、方法不会', done: true, source: 'rule' },
      { id: uid(), kpId: '', title: '整理线代错题笔记', minutes: 20, tag: '练习', reason: '手动添加', done: false, source: 'manual' },
      { id: uid(), kpId: s.kps[7].id, title: 'Python · Pandas 基础操作', minutes: 25, tag: '新学', reason: '核心知识点尚未入门', done: false, source: 'rule' }
    ];
    // Agent 多日规划示例（未来任务）
    s.planItems.push(
      { id: uid(), kpId: s.kps[5].id, title: '线性代数 · 特征值与特征向量', minutes: 40, tag: '薄弱推进', reason: 'Agent 规划：概念不清需专项突破', done: false, source: 'agent', planDate: off(1) },
      { id: uid(), kpId: s.kps[2].id, title: '高等数学 · 求导法则与应用', minutes: 25, tag: '到期复习', reason: 'Agent 规划：保持记忆曲线', done: false, source: 'agent', planDate: off(2) }
    );

    // 课表 / 待办 / 倒计时
    s.schedule = [
      { id: uid(), name: '高等数学', teacher: '王教授', room: '教学楼A-301', day: 1, start: '08:00', end: '09:40', weeks: 'all', color: '#4f6bf0' },
      { id: uid(), name: '线性代数', teacher: '李老师', room: '教学楼B-201', day: 2, start: '10:00', end: '11:40', weeks: 'odd', color: '#8b5cf6' },
      { id: uid(), name: 'C语言程序设计', teacher: '张老师', room: '实验楼机房3', day: 3, start: '14:00', end: '15:40', weeks: 'all', color: '#f59e0b' },
      { id: uid(), name: 'Python 与数据分析', teacher: '', room: '线上', day: 4, start: '16:00', end: '17:40', weeks: 'even', color: '#10b981' },
      { id: uid(), name: '高数习题课', teacher: '王教授', room: '教学楼A-301', day: 5, start: '14:00', end: '15:40', weeks: 'all', color: '#4f6bf0' }
    ];
    s.todos = [
      { id: uid(), text: '交高数第三章作业', date: off(-1), priority: 'high', done: false, createdAt: Date.now() - 86400000 * 2 },
      { id: uid(), text: '预约图书馆自习座位', date: off(1), priority: 'mid', done: false, createdAt: Date.now() - 86400000 },
      { id: uid(), text: '购买错题打印本', date: '', priority: 'low', done: true, createdAt: Date.now() - 86400000 * 3 }
    ];
    s.countdowns = [
      { id: uid(), title: '英语四级', date: off(23) },
      { id: uid(), title: '期末考试周', date: off(37) }
    ];

    // 练习室：题库 + 练习记录
    const q = (kpIdx, stem, options, answer, explain, src) => ({
      id: uid(), kpId: s.kps[kpIdx].id, type: 'choice', stem, options, answer, explain, source: src || 'ai', createdAt: off(0)
    });
    s.questions = [
      q(1, '两个无穷小的比较中，若 lim β/α = 0，则称 β 是 α 的？', ['同阶无穷小', '等价无穷小', '高阶无穷小', '低阶无穷小'], 2, '商的极限为 0 时，β 是比 α 更高阶的无穷小。'),
      q(1, '下列哪组不是等价无穷小（x→0）？', ['sin x ~ x', 'tan x ~ x', 'ln(1+x) ~ x', 'cos x ~ x'], 3, 'cos x → 1，不趋于 0，不是无穷小。'),
      q(5, '特征方程 r² - 5r + 6 = 0 对应矩阵的特征值为？', ['2 和 3', '-2 和 -3', '5 和 6', '1 和 6'], 0, '因式分解 (r-2)(r-3)=0。'),
      q(6, 'while 循环的循环体至少执行一次的条件是？', ['任何情况', '条件初始为真', 'do-while 才至少一次', 'break 存在时'], 2, 'while 先判断后执行；do-while 才保证至少执行一次。', 'manual')
    ];
    const att = (kpIdx, okFlag, etype, dOff) => ({
      id: uid(), kpId: s.kps[kpIdx].id, questionId: '', isCorrect: okFlag,
      errorType: etype || '', date: off(dOff), ts: Date.now() - dOff * 86400000
    });
    s.attempts = [
      att(1, true, '', 5), att(1, false, '概念不清', 4), att(1, false, '概念不清', 2), att(1, true, '', 1),
      att(5, false, '概念不清', 3), att(5, true, '', 1),
      att(6, false, '知识迁移', 2), att(6, true, '', 0)
    ];

    // 番茄钟记录
    s.pomodoroLog = {};
    s.pomodoroLog[off(0)] = { count: 2, minutes: 50 };
    s.pomodoroLog[off(-1)] = { count: 3, minutes: 75 };
    s.pomodoroLog[off(-2)] = { count: 1, minutes: 25 };

    // 练习事件（供「知识点变化」图表）
    s.attempts.forEach(a => {
      if (!a.isCorrect && a.errorType === '概念不清') {
        evs.push({ id: uid(), ts: a.ts, date: a.date, type: 'practice', kpId: a.kpId, payload: { isCorrect: false, delta: -5 } });
      }
    });
    s.events = evs;
    state = s;
  }

  function wipe() {
    const api = state.api;
    const profile = Object.assign(blank().profile, { name: '', goal: '' });
    state = blank();
    state.api = api;
    state.profile = profile;
    save();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'study-os-backup-' + Engine.today() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.courses)) throw new Error('文件格式不正确');
    if (!data.schemaVersion || data.schemaVersion < 2) backfillV2(data);
    state = Object.assign(blank(), data);
    save();
  }

  async function schedulePush(retryCount = 0) {
    if (transport !== 'api') return;
    if (!Auth.tok()) return;
    
    try {
      const resp = await apiFetch('/api/state', {
        method: 'POST',
        body: JSON.stringify({
          courses: state.courses,
          kps: state.kps,
          logs: state.logs,
          mistakes: state.mistakes,
          planDate: state.planDate,
          planItems: state.planItems,
          planNote: state.planNote,
          planGenTs: state.planGenTs,
          events: state.events,
          profileSnapshots: state.profileSnapshots,
          assessments: state.assessments,
          knowledgeMaps: state.knowledgeMaps,
          growthPath: state.growthPath,
          notifyReadTs: state.notifyReadTs,
          reports: state.reports,
          chat: state.chat,
          schedule: state.schedule,
          todos: state.todos,
          countdowns: state.countdowns,
          pomodoroLog: state.pomodoroLog,
          questions: state.questions,
          attempts: state.attempts
        })
      });
      
      if (!resp.ok) {
        throw new Error(`同步失败: ${resp.status}`);
      }
      
      // 同步成功，重置重试计数
      if (window.syncRetryCount) {
        window.syncRetryCount = 0;
        toast('数据已同步到云端', 'success');
      }
      
    } catch (err) {
      console.error('同步失败:', err);
      
      // 失败时显示错误提示
      if (window.syncRetryCount === undefined) {
        window.syncRetryCount = 0;
      }
      
      // 指数退避重试（最多3次）
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        window.syncRetryCount = retryCount + 1;
        toast(`同步失败，${delay/1000}秒后重试...`, 'error');
        
        setTimeout(() => {
          schedulePush(retryCount + 1);
        }, delay);
      } else {
        // 重试3次后失败，显示最终错误
        toast('同步失败，请检查网络连接', 'error');
        window.syncRetryCount = 0;
      }
    }
  }

  return {
    get state() { return state; },
    set state(v) { state = v; },
    get transport() { return transport; },
    uid, save, logEvent, seedDemo, exportData, importData, wipe,
    Auth, apiFetch, detectTransport, hydrate, schedulePush,
    __setTransport(v) { transport = v; },
    __setApiBase(b) { apiBase = b || ''; }
  };
})();
