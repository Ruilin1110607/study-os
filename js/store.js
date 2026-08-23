const Store = (() => {
  const KEY = 'study_os_v1';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function blank() {
    return {
      schemaVersion: 2,
      profile: { name: '', goal: '', major: '', dailyMinutes: 180, semesterStart: '' },
      api: { preset: 'pollinations', base: 'https://text.pollinations.ai', key: '', model: 'openai' },
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
      pomodoroLog: {}
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.schemaVersion || parsed.schemaVersion < 2) backfillV2(parsed);
        if (!parsed.api || (!parsed.api.key && parsed.api.preset === 'deepseek')) {
          parsed.api = Object.assign(blank().api, parsed.api || {},
            { preset: 'pollinations', base: 'https://text.pollinations.ai', key: '', model: 'openai' });
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
  }

  function save() {
    prune();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (window.App && App.render) App.render();
  }

  function logEvent(type, kpId, payload) {
    try {
      state.events.push({ id: uid(), ts: Date.now(), date: dstr(new Date()), type, kpId: kpId || '', payload: payload || {} });
    } catch (e) {}
  }

  function seedDemo() {
    const off = n => Engine.addDays(Engine.today(), n);
    const s = blank();
    s.profile = { name: 'Ruilin', goal: '保研 · 高绩点', major: '数据科学', dailyMinutes: 180 };
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
    s.logs.forEach((l, i) => evs.push({
      id: uid(), ts: new Date(l.date + 'T19:00:00').getTime(), date: l.date,
      type: 'checkin', kpId: l.kpId, payload: { rating: l.rating, minutes: l.minutes }
    }));
    s.mistakes.forEach(m => evs.push({
      id: uid(), ts: new Date(m.date + 'T21:00:00').getTime(), date: m.date,
      type: 'mistake', kpId: m.kpId, payload: { tag: m.tag }
    }));
    s.events = evs;
    state = s;
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

  return {
    get state() { return state; },
    set state(v) { state = v; },
    uid, save, logEvent, seedDemo, exportData, importData
  };
})();
