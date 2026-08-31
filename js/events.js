// 事件分发（原 app.js 三个 document 监听器，忠实搬移；须在 app.js 之后加载）
(() => {
  const { $, esc, toast, closeModal, guardAI, flags } = UI;
  const A = window.App;

  document.addEventListener('click', async e => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) { closeModal(); return; }
    const el = e.target.closest('[data-fill]');
    if (el) {
      const inp = $('#replan-text');
      if (inp) inp.value = el.dataset.fill;
      return;
    }
    const chip = e.target.closest('[data-ask]');
    if (chip) { Agent.sendChat(chip.dataset.ask); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    switch (act) {
      case 'nav':
        A.setView(btn.dataset.view);
        A.render();
        break;
      case 'modal-x': closeModal(); break;
      case 'chat-open': $('#drawer').classList.add('open'); Agent.renderChat(); break;
      case 'chat-close': $('#drawer').classList.remove('open'); break;
      case 'chat-clear': Store.state.chat = []; Store.save(); break;
      case 'gen-plan': await Actions.doGen(''); break;
      case 'replan-open': Modals.openReplan(); break;
      case 'task-add': Modals.openTaskModal(); break;
      case 'item-toggle': Actions.toggleItem(id); break;
      case 'ck-rate': Modals.setRate(btn.dataset.r); break;
      case 'ck-save': Modals.saveCheckin(); break;
      case 'course-add': Modals.openCourseModal(); break;
      case 'course-del':
        if (confirm('删除该课程及其所有知识点？')) {
          const c = Engine.course(id);
          Store.state.courses = Store.state.courses.filter(x => x.id !== id);
          Store.state.kps = Store.state.kps.filter(p => p.courseId !== id);
          Store.save();
          toast(`已删除「${c ? c.name : ''}」`, 'success');
        }
        break;
      case 'kp-add': Modals.openKpModal(btn.dataset.course); break;
      case 'kp-checkin': Modals.openCheckin({ kpId: id }); break;
      case 'kp-mistake': Modals.openMistakeModal(id); break;
      case 'kp-practice': Quiz.startSelfTest(id); break;
      case 'kp-star': {
        const sp = Engine.kp(id);
        if (sp) {
          sp.importance = (sp.importance || 0) >= 4 ? 3 : 5;
          Store.save();
          toast(sp.importance >= 4 ? '已标为核心知识点，规划与练习权重将提升' : '已取消核心标记');
        }
        break;
      }
      case 'kp-del':
        if (confirm('删除该知识点？')) {
          Store.state.kps = Store.state.kps.filter(p => p.id !== id);
          Store.save();
        }
        break;
      case 'mk-add': Modals.openMistakeModal(); break;
      case 'mk-diag': await Actions.diag(id); break;
      case 'mk-review': Actions.reviewTomorrow(id); break;
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
      case 'report-week': await Actions.weekly(); break;
      case 'report-risk': await Actions.risk(); break;
      case 'prac-self': Quiz.startSelfTest(id); break;
      case 'prac-gen-kp': Quiz.openQGenModal(id); break;
      case 'q-gen-open': Quiz.openQGenModal(); break;
      case 'q-add-open': Quiz.openQAddModal(); break;
      case 'prac-one': Quiz.startSet([id]); break;
      case 'prac-set': {
        const ids = Store.state.questions
          .filter(q => { const p = Engine.kp(q.kpId); return p && p.courseId === id; })
          .map(q => q.id);
        Quiz.startSet(ids);
        break;
      }
      case 'q-del':
        Store.state.questions = Store.state.questions.filter(q => q.id !== id);
        Store.save();
        break;
      case 'qz-pick': Quiz.quizPick(Number(btn.dataset.i)); break;
      case 'qz-next': Quiz.quizNext(); break;
      case 'qz-self': Quiz.quizSelf(btn.dataset.ok === '1'); break;
      case 'qz-done-save': Quiz.saveQuizResult(); break;
      case 'insight-go': {
        const kind = btn.dataset.kind;
        if ((kind === 'practice' || kind === 'mission') && id) Quiz.startSelfTest(id);
        else { A.setView(kind === 'review' ? 'tree' : 'practice'); A.render(); }
        break;
      }
      case 'agent-run': await Agent.runAgentAction(btn.dataset.mid, Number(btn.dataset.i)); break;
      case 'agent-skip': Agent.skipAgentAction(btn.dataset.mid, Number(btn.dataset.i)); break;
      case 'auth-tab': Modals.openAuthModal(btn.dataset.m); break;
      case 'logout':
        Store.Auth.clear();
        location.reload();
        break;
      case 'data-range':
        ViewsData.setRange(Number(btn.dataset.n) || 7);
        A.render();
        break;
      case 'nav-jump':
        A.setView(btn.dataset.view || 'today');
        A.render();
        break;
      case 'api-test': await Actions.testApi(); break;
      case 'api-clear-key':
        try {
          const r = await Store.apiFetch('/api/ai/config', { method: 'POST', body: { clear_key: true } });
          Store.state.api.keySet = !!r.hasKey;
          AI.setServerReady(r.configured);
          A.render();
          toast('已清除服务器保存的 Key', 'success');
        } catch (e) { toast('清除失败：' + e.message, 'error'); }
        break;
      case 'notif-open': Modals.openNotif(); break;
      case 'about-open': Modals.openAbout(); break;
      case 'mark-read':
        Store.state.notifyReadTs = Date.now();
        Store.save();
        closeModal();
        break;
      case 'assess-now':
        if (flags.ai || !guardAI()) break;
        flags.ai = true;
        toast('Agent 正在体检…');
        try {
          await Assessor.maybeRun(true);
          toast('体检完成', 'success');
        } catch (e) { toast(e.message, 'error'); }
        finally { flags.ai = false; }
        break;
      case 'apply-adjust': {
        const la = Store.state.assessments[0];
        await Actions.doGen(la ? '参考最近学习体检的建议：' + (la.report.adjustReason || '') : '');
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
      case 'map-gen': Modals.openMapGenModal(); break;
      case 'map-parse': Modals.openMapParseModal(); break;
      case 'map-import': Modals.importMap(id); break;
      case 'map-del':
        if (confirm('删除这张知识地图？')) {
          Store.state.knowledgeMaps = Store.state.knowledgeMaps.filter(x => x.id !== id);
          Store.save();
        }
        break;
      case 'pomo-toggle':
        ViewsTools.pomoToggle();
        A.render();
        break;
      case 'pomo-reset':
        ViewsTools.pomoReset();
        A.render();
        break;
      case 'sched-tab':
        ViewsTools.setSchedTab(btn.dataset.tab);
        A.render();
        break;
      case 'sched-add': Modals.openSchedModal(); break;
      case 'sched-del':
        if (confirm('删除这门课？')) {
          Store.state.schedule = Store.state.schedule.filter(x => x.id !== id);
          Store.save();
        }
        break;
      case 'cd-add': Modals.openCdModal(); break;
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
          Store.wipe();
          A.setView('today');
          Modals.onboard();
          toast('已清空学习数据', 'success');
        }
        break;
      case 'onboard-demo':
        Store.seedDemo();
        Store.save();
        closeModal();
        toast('示例数据已载入', 'success');
        break;
      case 'welcome-demo':
        Store.seedDemo();
        Store.save();
        closeModal();
        A.setView('today');
        toast('试用数据已载入！建议按侧栏顺序逛一遍：知识树 → 练习室 → 学习数据', 'success');
        break;
      case 'welcome-blank':
        closeModal();
        Modals.onboard();
        break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.chg === 'exam-date') {
      const c = Engine.course(t.dataset.id);
      if (c) { c.examDate = t.value; Store.save(); toast('考试日期已更新'); }
    } else if (t.dataset.chg === 'mk-filter') {
      ViewsMistakes.setFilter(t.value);
      App.render();
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
      Modals.fillKpSelect(t.value);
    } else if (t.id === 'f-qadd-course') {
      Quiz.fillKpInto('#f-qadd-kp', t.value);
    } else if (t.id === 'f-qgen-course') {
      Quiz.fillKpInto('#f-qgen-kp', t.value);
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
    if (!['f-profile', 'f-api', 'f-replan', 'f-task', 'f-course', 'f-kp', 'f-mistake', 'f-onboard', 'f-todo', 'f-sched', 'f-cd', 'chat-form', 'f-qadd', 'f-qgen', 'f-auth', 'f-map-gen', 'f-map-parse', 'f-path'].includes(f.id)) return;
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
        try {
          await Actions.saveApiConfig();
          Store.save();
          toast('配置已保存，可点击「测试连接」验证', 'success');
        } catch (e) {
          toast('保存失败：' + e.message, 'error');
        }
        break;
      case 'f-replan': {
        const txt = $('#replan-text').value.trim();
        closeModal();
        await Actions.doGen(txt);
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
        flags.ai = true;
        toast('正在生成知识地图…');
        try {
          const r = await AI.genKnowledgeMap(String(d.get('major')).trim(), d.get('grade'), String(d.get('extra') || '').trim());
          Store.state.knowledgeMaps.unshift({
            id: Store.uid(), major: r.major || String(d.get('major')).trim(),
            directions: r.directions || [], createdAt: Engine.today(), imported: false
          });
          A.setView('growth');
          Store.save();
          toast('地图已生成，请展开核对后导入', 'success');
        } catch (e) { toast('生成失败：' + e.message, 'error'); }
        finally { flags.ai = false; }
        break;
      }
      case 'f-map-parse': {
        if (!guardAI()) break;
        const txt = String(d.get('text') || '').trim();
        if (!txt) { toast('请粘贴方案文本', 'error'); break; }
        closeModal();
        flags.ai = true;
        toast('正在解析培养方案…');
        try {
          const r = await AI.parsePlanText(txt, String(d.get('major') || '').trim());
          Store.state.knowledgeMaps.unshift({
            id: Store.uid(), major: r.major || String(d.get('major') || '').trim() || '培养方案',
            directions: r.directions || [], createdAt: Engine.today(), imported: false
          });
          A.setView('growth');
          Store.save();
          toast('解析完成，请展开核对后导入', 'success');
        } catch (e) { toast('解析失败：' + e.message, 'error'); }
        finally { flags.ai = false; }
        break;
      }
      case 'f-path': {
        const goal = String(d.get('goal') || '').trim();
        if (!goal) { toast('请填写长期目标', 'error'); break; }
        if (!guardAI()) break;
        flags.ai = true;
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
        finally { flags.ai = false; }
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
        Agent.sendChat();
        break;
      case 'f-qadd': {
        const kpId = d.get('kp');
        if (!kpId) { toast('请选择知识点', 'error'); return; }
        const opts = ['A', 'B', 'C', 'D'].map(k => String(d.get('opt' + k) || '').trim());
        const stem = String(d.get('stem') || '').trim();
        if (!stem) { toast('请填写题干', 'error'); return; }
        if (opts.some(o => !o)) { toast('请填全 A/B/C/D 四个选项', 'error'); return; }
        Store.state.questions.push({
          id: Store.uid(), kpId, type: 'choice',
          stem, options: opts,
          answer: Math.max(0, Math.min(3, Number(d.get('ans')) || 0)),
          explain: String(d.get('explain') || '').trim(),
          source: 'manual', createdAt: Engine.today()
        });
        Store.save();
        closeModal();
        toast('题目已存入题库，可到「我的题库」开练', 'success');
        break;
      }
      case 'f-qgen': {
        const kpId = d.get('kp');
        if (!kpId) { toast('该课程还没有知识点，先到知识树添加', 'error'); return; }
        await Quiz.genAndStart(kpId, Number(d.get('count')) || 3, d.get('diff'));
        break;
      }
      case 'f-auth': {
        const mode = f.dataset.mode === 'register' ? 'register' : 'login';
        const username = String(d.get('username') || '').trim().toLowerCase();
        const password = String(d.get('password') || '');
        const errEl = $('#auth-err');
        if (!username) { errEl.textContent = '请填写用户名'; return; }
        if (password.length < 8) { errEl.textContent = '密码至少 8 位'; return; }
        const body = mode === 'register'
          ? { username, password, display_name: String(d.get('display_name') || '').trim() }
          : { username, password };
        try {
          errEl.textContent = '请稍候…';
          const r = await Store.apiFetch('/api/auth/' + mode, { method: 'POST', body });
          Store.Auth.set(r.token);
          const snap = await Store.apiFetch('/api/state');
          Store.hydrate(snap);
          try {
            const st = await Store.apiFetch('/api/ai/status');
            AI.setServerReady(st.configured);
          } catch (e) {}
          closeModal();
          A.afterBoot();
          toast(`欢迎，${r.display_name || r.username}`, 'success');
        } catch (e) {
          errEl.textContent = e.status === 409 ? '用户名已被占用，换一个试试'
            : e.status === 401 ? '用户名或密码错误' : e.message;
        }
        break;
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      $('#drawer').classList.remove('open');
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-input') {
      e.preventDefault();
      Agent.sendChat();
    }
  });
})();
