// 应用装配层：视图路由 + 启动引导（视图/弹窗/动作/事件已拆分至各模块）
const App = (() => {
  const { $, $$, toast } = UI;

  let view = 'today';
  const VIEWS = {
    today: ViewsToday, tools: ViewsTools, tree: ViewsTree, practice: ViewsPractice,
    mistakes: ViewsMistakes, data: ViewsData, growth: ViewsGrowth, settings: ViewsSettings
  };

  function render() {
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const dot = $('#api-dot'), lab = $('#api-label');
    dot.classList.toggle('on', AI.ready());
    const ap = Store.state.api;
    lab.textContent = !AI.ready() ? 'AI 未配置' : 'AI 已连接 · ' + ap.model;
    $('#main').innerHTML = (VIEWS[view] || ViewsToday)();
    Agent.renderChat();
  }

  function isEmptyState() {
    const S = Store.state;
    return !S.courses.length && !S.kps.length && !S.logs.length && !S.mistakes.length;
  }

  async function init() {
    try { await Store.detectTransport(); } catch (e) {}
    if (Store.transport === 'api') {
      if (!Store.Auth.tok()) { Modals.openAuthModal('login'); return; }
      try {
        const snap = await Store.apiFetch('/api/state');
        Store.hydrate(snap);
      } catch (e) {
        if (e.status === 401) {
          Store.Auth.clear();
          Modals.openAuthModal('login');
          return;
        }
        toast('云端同步失败，本次以本机数据运行', 'error');
      }
      try {
        const st = await Store.apiFetch('/api/ai/status');
        AI.setServerReady(st.configured);
      } catch (e) {}
    }
    afterBoot();
  }

  function afterBoot() {
    if (isEmptyState()) Modals.openWelcome();
    else if (!Store.state.profile.name) Modals.onboard();
    render();
    
    // 启动同步状态指示
    const dot = $('#api-dot'), lab = $('#api-label');
    const updateSyncStatus = () => {
      const retryCount = window.syncRetryCount || 0;
      if (retryCount > 0) {
        dot.classList.add('retrying');
        lab.textContent = `同步失败，重试中 (${retryCount}/3)`;
      } else if (AI.ready()) {
        dot.classList.add('on');
        lab.textContent = 'AI 已连接 · ' + Store.state.api.model;
      } else {
        dot.classList.remove('on', 'retrying');
        lab.textContent = 'AI 未配置';
      }
    };
    
    // 初始状态
    updateSyncStatus();
    
    // 监听重试状态变化
    const originalSchedulePush = Store.schedulePush;
    Store.schedulePush = async function(...args) {
      const result = await originalSchedulePush.apply(this, args);
      updateSyncStatus();
      return result;
    };
    
    setTimeout(async () => {
      try {
        // 启动定期同步（每30秒检查一次）
        const scheduleRegularSync = () => {
          setTimeout(scheduleRegularSync, 30000);
          Store.schedulePush();
        };
        scheduleRegularSync();
        const ran = await Assessor.maybeRun(false);
        if (ran) {
          render();
          toast('Study Agent 刚完成一次后台学习体检，见「通知」', 'success');
        }
      } catch (e) {}
    }, 1500);
  }

  // 事件层（events.js，在 app.js 之后加载）通过此入口驱动路由与启动流程
  window.App = {
    render,
    setView: v => { view = v; },
    get view() { return view; },
    afterBoot
  };
  init();

  return { render };
})();
