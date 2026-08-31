// Study Agent 对话与动作执行（原 app.js renderChat/sendChat/action* 系列，忠实搬移）
const Agent = (() => {
  const { $, esc, mdToHtml, toast, flags, TAGC } = UI;

  function renderChat() {
    const box = $('#chat-msgs');
    if (!box) return;
    const st = $('#agent-status');
    if (st) st.textContent = AI.ready() ? '在线' : '未配置 API';
    const msgs = Store.state.chat.slice(-40);
    $('#chat-msgs').innerHTML = msgs.length
      ? msgs.map(m => {
          const bubble = `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${mdToHtml(m.content)}</div>`;
          if (m.role === 'assistant' && Array.isArray(m.actions) && m.actions.length) {
            return bubble + '<div class="agent-acts">' + m.actions.map((a, i) => actionCardHtml(m, a, i)).join('') + '</div>';
          }
          return bubble;
        }).join('')
      : '<div class="msg bot">你好，我是你的 Study Agent。我看得见你的全部学习数据，可以直接操作学习系统：\n· 「我只有1小时，帮我重排今天」\n· 「未来5天每天2小时，帮我冲刺高数」→ 多日计划\n· 「帮我练练极限」→ 生成练习题\n· 「把无穷小加入明天复习」\n所有写操作都会先征求你的确认。</div>';
    $('#chat-chips').innerHTML = [
      '我只有1小时，帮我重排今天',
      '我最近最薄弱的地方是什么？',
      '帮我分析一下这周的状态',
      '考试快到了怎么办'
    ].map(t => `<span class="chip" data-ask="${esc(t)}">${esc(t)}</span>`).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function sendChat(forcedText) {
    const inp = $('#chat-input');
    const t = forcedText || inp.value.trim();
    if (!t || flags.chat) return;
    if (!AI.ready()) {
      toast('请先在「设置」中接入 AI 服务', 'error');
      return;
    }
    flags.chat = true;
    inp.value = '';
    Store.state.chat.push({ id: Store.uid(), role: 'user', content: t });
    renderChat();
    $('#chat-msgs').insertAdjacentHTML('beforeend', '<div class="msg bot" id="chat-typing">思考中…</div>');
    const box = $('#chat-msgs');
    box.scrollTop = box.scrollHeight;
    try {
      let r;
      try {
        r = await AI.agentAct(t);
      } catch (e1) {
        const fallback = await AI.ask(t);
        r = { reply: fallback + '\n\n（本次以纯问答模式回答，操作模式暂不可用：' + e1.message + '）', actions: [] };
      }
      Store.state.chat.push({
        id: Store.uid(), role: 'assistant', content: r.reply,
        actions: (r.actions || []).map(a => Object.assign({ done: false }, a))
      });
      Store.save();
    } catch (e) {
      Store.state.chat.push({ role: 'assistant', content: '请求失败：' + e.message });
      Store.save();
    } finally {
      flags.chat = false;
      renderChat();
    }
  }

  function actionLabel(a) {
    switch (a.type) {
      case 'create_tasks': {
        const items = Array.isArray(a.items) ? a.items : [];
        const shown = items.slice(0, 4).map(x => esc(x.title)).join('、');
        return '创建 ' + items.length + ' 个今日任务' + (shown ? '：' + shown + (items.length > 4 ? ' 等' : '') : '');
      }
      case 'replan_today':
        return '按你的情况重排今日计划' + (a.constraint ? '「' + esc(a.constraint) + '」' : '');
      case 'generate_practice': {
        const p = Engine.kp(a.kpId);
        return '为「' + (p ? esc(p.name) : esc(a.query) || '?') + '」生成 ' + (Number(a.count) || 3) + ' 道练习题';
      }
      case 'add_review_tomorrow': {
        const p = Engine.kp(a.kpId);
        return '把「' + (p ? esc(p.name) : esc(a.query) || '?') + '」加入明天复习队列';
      }
      case 'plan_days': {
        const days = Array.isArray(a.days) ? a.days : [];
        const n = days.reduce((s2, d2) => s2 + ((d2 && d2.items) || []).length, 0);
        return '生成 ' + days.length + ' 天学习计划，共 ' + n + ' 项任务';
      }
      default:
        return '未知操作：' + esc(a.type);
    }
  }

  function actionCardHtml(m, a, i) {
    if (a.done) {
      return `<div class="agent-act">
        <span class="sm grow">${actionLabel(a)}</span>
        <span class="tag ${a.skipped ? 'gray' : 'green'}">${a.skipped ? '已跳过' : '已执行'}</span>
      </div>`;
    }
    return `<div class="agent-act">
      <span class="sm grow">${actionLabel(a)}</span>
      <button class="btn primary sm" data-act="agent-run" data-mid="${m.id}" data-i="${i}">确认执行</button>
      <button class="mini" data-act="agent-skip" data-mid="${m.id}" data-i="${i}">跳过</button>
    </div>`;
  }

  async function runAgentAction(mid, i) {
    const m = Store.state.chat.find(x => x.id === mid);
    if (!m || !m.actions || !m.actions[i] || m.actions[i].done) return;
    const a = m.actions[i];
    try {
      await execAgentAction(a);
      a.done = true;
      Store.logEvent('agent_action', a.kpId || '', { type: a.type });
      Store.save();
      toast('Agent 操作已执行', 'success');
    } catch (e) {
      toast('执行失败：' + e.message, 'error');
    }
  }

  function skipAgentAction(mid, i) {
    const m = Store.state.chat.find(x => x.id === mid);
    if (!m || !m.actions || !m.actions[i] || m.actions[i].done) return;
    m.actions[i].done = true;
    m.actions[i].skipped = true;
    Store.save();
  }

  async function execAgentAction(a) {
    const S = Store.state;
    switch (a.type) {
      case 'create_tasks': {
        const validIds = new Set(S.kps.map(p => p.id));
        (Array.isArray(a.items) ? a.items : []).forEach(it => {
          it = it || {};
          S.planItems.push({
            id: Store.uid(),
            kpId: it.kpId && validIds.has(it.kpId) ? it.kpId : '',
            title: String(it.title || 'Agent 任务').slice(0, 60),
            minutes: Math.max(5, Math.min(120, Number(it.minutes) || 25)),
            tag: TAGC[it.tag] ? it.tag : '薄弱推进',
            reason: String(it.reason || '来自 Agent 建议').slice(0, 120),
            done: false, source: 'agent'
          });
        });
        S.planDate = Engine.today();
        break;
      }
      case 'replan_today':
        await Actions.doGen(String(a.constraint || ''));
        break;
      case 'generate_practice': {
        const kp = Engine.kp(a.kpId) || (a.query ? AI.findKp(a.query) : null);
        if (!kp) throw new Error('找不到对应知识点');
        await Quiz.genAndStart(kp.id, Math.max(1, Math.min(8, Number(a.count) || 3)), a.difficulty || '进阶');
        break;
      }
      case 'add_review_tomorrow': {
        const p = Engine.kp(a.kpId) || (a.query ? AI.findKp(a.query) : null);
        if (!p) throw new Error('找不到对应知识点');
        p.stage = 0;
        p.nextReview = Engine.addDays(Engine.today(), 1);
        break;
      }
      case 'plan_days': {
        const validIds = new Set(S.kps.map(p => p.id));
        const days = Array.isArray(a.days) ? a.days : [];
        days.forEach(day => {
          const date = String((day && day.date) || '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
          ((day.items) || []).forEach(it => {
            it = it || {};
            S.planItems.push({
              id: Store.uid(),
              kpId: it.kpId && validIds.has(it.kpId) ? it.kpId : '',
              title: String(it.title || '学习任务').slice(0, 60),
              minutes: Math.max(5, Math.min(240, Number(it.minutes) || 30)),
              tag: TAGC[it.tag] ? it.tag : '薄弱推进',
              reason: String(it.reason || 'Agent 多日规划').slice(0, 120),
              done: false, source: 'agent',
              planDate: date
            });
          });
        });
        break;
      }
      default:
        throw new Error('不支持的操作类型：' + a.type);
    }
  }

  return { renderChat, sendChat, runAgentAction, skipAgentAction };
})();
