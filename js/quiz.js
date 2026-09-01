// 练习测验状态机（原 app.js quiz 相关函数，忠实搬移）
const Quiz = (() => {
  const { $, $$, esc, toast, openModal, closeModal, guardAI, flags } = UI;

  let quiz = null;
  let lastQuizWrong = [];

  function fillKpInto(sel, courseId, selId) {
    const el = $(sel);
    if (!el) return;
    const list = Store.state.kps.filter(p => p.courseId === courseId);
    el.innerHTML = list.length
      ? list.map(p => `<option value="${p.id}" ${selId === p.id ? 'selected' : ''}>${esc((p.chapter ? p.chapter + ' · ' : '') + p.name)}</option>`).join('')
      : '<option value="">（该课程暂无知识点）</option>';
  }

  function recordAttempt(kpId, qid, ok, errorType) {
    const S = Store.state;
    S.attempts.push({
      id: Store.uid(), kpId, questionId: qid || '', isCorrect: !!ok,
      errorType: errorType || '', date: Engine.today(), ts: Date.now()
    });
    Engine.practiceResult(kpId, ok);
    Store.logEvent('practice_attempt', kpId, { isCorrect: !!ok });
  }

  function startSelfTest(kpId) {
    const p = Engine.kp(kpId);
    if (!p) return;
    quiz = { mode: 'self', idx: 0, correct: 0, answered: false, items: [{ kpId }], wrong: [] };
    renderSelfStep();
  }

  function renderSelfStep() {
    const it = quiz.items[quiz.idx];
    const p = Engine.kp(it.kpId);
    const nm = p ? ((Engine.courseName(p.courseId) ? Engine.courseName(p.courseId) + ' · ' : '') + p.name) : '';
    openModal(`
    <div class="modal-head">快速自测 · ${esc(nm)}</div>
    <div class="modal-body">
      <div class="q-stem" style="font-size:15px">合上资料，回忆「${esc(p ? p.name : '')}」：</div>
      <ul class="sm muted" style="line-height:2;padding-left:18px;margin-bottom:12px">
        <li>它的定义 / 公式 / 核心步骤是什么？</li>
        <li>典型题目长什么样，从哪里下手？</li>
        <li>自己以前在哪一步栽过跟头？</li>
      </ul>
      <div class="note">回忆完成后翻开资料对照，诚实自评——主动回忆 + 诚实反馈，是效率最高的复习方式。</div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn danger sm" data-act="qz-self" data-ok="0">没掌握</button>
      <button type="button" class="btn primary sm" data-act="qz-self" data-ok="1">掌握了</button>
    </div>`);
  }

  async function genAndStart(kpId, count, diff) {
    if (flags.ai || !guardAI()) return;
    flags.ai = true;
    toast('Agent 正在出题…');
    try {
      const list = await AI.genQuestions(kpId, count, diff);
      if (!list.length) throw new Error('没有生成有效题目，请重试');
      const S = Store.state;
      const made = list.map(q => {
        const o = {
          id: Store.uid(), kpId, type: 'choice',
          stem: q.stem, options: q.options, answer: q.answer, explain: q.explain,
          source: 'ai', createdAt: Engine.today()
        };
        S.questions.push(o);
        return o;
      });
      Store.save();
      closeModal();
      toast(`已生成 ${made.length} 道题，开始练习`, 'success');
      startSet(made.map(q => q.id));
    } catch (e) {
      toast('出题失败：' + e.message, 'error');
    } finally { flags.ai = false; }
  }

  function startSet(ids) {
    const S = Store.state;
    const qs = ids.map(id => S.questions.find(q => q.id === id)).filter(Boolean);
    if (!qs.length) { toast('没有可练习的题目，先加几道题吧', 'error'); return; }
    quiz = {
      mode: 'choice', idx: 0, correct: 0, answered: false, wrong: [],
      items: qs.map(q => ({ q }))
    };
    renderQuizStep();
  }

  function renderQuizStep() {
    const it = quiz.items[quiz.idx];
    const q = it.q;
    const prog = Math.round(quiz.idx / quiz.items.length * 100);
    const p = Engine.kp(q.kpId);
    openModal(`
    <div class="modal-head">${esc(p ? p.name : '练习')}<span class="muted sm" style="font-weight:400;margin-left:8px">${quiz.idx + 1} / ${quiz.items.length} · 答对 ${quiz.correct}</span></div>
    <div class="modal-body">
      <div class="qz-prog"><i style="width:${prog}%"></i></div>
      <div class="q-stem">${esc(q.stem)}</div>
      <div id="qz-opts">${(q.options || []).map((o, i) =>
        `<button type="button" class="opt-btn" data-act="qz-pick" data-i="${i}"><span class="opt-key">${'ABCD'[i] || i + 1}</span>${esc(o)}</button>`).join('')}</div>
      <div id="qz-fb"></div>
    </div>`);
  }

  function quizPick(i) {
    if (!quiz || quiz.answered) return;
    const q = quiz.items[quiz.idx].q;
    quiz.answered = true;
    const ok = i === q.answer;
    recordAttempt(q.kpId, q.id, ok, ok ? '' : '方法不会');
    if (ok) quiz.correct++;
    else quiz.wrong.push({ kpId: q.kpId, stem: q.stem, explain: q.explain, errorType: '方法不会' });
    $$('#qz-opts .opt-btn').forEach((b, bi) => {
      if (bi === q.answer) b.classList.add('right');
      else if (bi === i && !ok) b.classList.add('wrong');
    });
    const last = quiz.idx + 1 >= quiz.items.length;
    $('#qz-fb').innerHTML = `
      <div class="explain-box"><b style="color:${ok ? 'var(--green)' : 'var(--red)'}">${ok ? '✓ 答对了' : '✗ 答错了，正确答案是 ' + ('ABCD'[q.answer] || q.answer + 1)}</b>${q.explain ? '<br>' + esc(q.explain) : ''}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button class="btn primary sm" data-act="qz-next">${last ? '完成练习' : '下一题'}</button>
      </div>`;
    Store.save();
  }

  function quizNext() {
    if (!quiz) return;
    quiz.answered = false;
    quiz.idx++;
    if (quiz.idx >= quiz.items.length) finishQuiz();
    else renderQuizStep();
  }

  function quizSelf(ok) {
    if (!quiz) return;
    const it = quiz.items[quiz.idx];
    recordAttempt(it.kpId, '', ok, ok ? '' : '概念不清');
    if (ok) quiz.correct++;
    else quiz.wrong.push({ kpId: it.kpId, stem: '', errorType: '概念不清' });
    quiz.idx++;
    if (quiz.idx >= quiz.items.length) finishQuiz();
    else renderSelfStep();
  }

  function finishQuiz() {
    const n = quiz.items.length;
    const c = quiz.correct;
    const pct = n ? Math.round(c / n * 100) : 0;
    lastQuizWrong = quiz.wrong.slice();
    quiz = null;
    const msg = pct === 100 ? '完美，这个知识点可以放心了' : pct >= 80 ? '很扎实，保持节奏'
      : pct >= 60 ? '有印象但不牢，明天再复习一轮' : '建议重看概念，再做一轮题';
    openModal(`
    <div class="modal-head">练习完成</div>
    <div class="modal-body">
      <div style="text-align:center;margin-bottom:16px">
        <b style="font-size:42px;line-height:1.2;color:${pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)'}">${c}<span class="muted" style="font-size:20px">/${n}</span></b>
        <div class="sm muted">正确率 ${pct}% · ${msg}</div>
      </div>
      ${lastQuizWrong.length ? `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);margin-bottom:6px">
        <input type="checkbox" id="qz-mk" checked style="width:auto">
        把答错的 ${lastQuizWrong.length} 项写入错题本<span class="muted sm">（对应知识点明天进入复习队列）</span>
      </label>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn ghost sm" data-act="modal-x">关闭</button>
      <button class="btn primary sm" data-act="qz-done-save">保存结果</button>
    </div>`);
  }

  function saveQuizResult() {
    const w = lastQuizWrong;
    lastQuizWrong = [];
    const doMk = $('#qz-mk') && $('#qz-mk').checked;
    if (doMk) {
      w.forEach(wi => {
        const p = Engine.kp(wi.kpId);
        if (!p) return;
        const desc = wi.stem
          ? '【练习错题】' + wi.stem + (wi.explain ? '\n解析：' + wi.explain : '')
          : '【快速自测】未能独立回忆出「' + p.name + '」的核心内容';
        Engine.addMistake(wi.kpId, wi.errorType || '概念不清', desc);
      });
    }
    Store.save();
    closeModal();
    toast(doMk && w.length ? `已写入 ${w.length} 条错题，相关知识点明天复习` : '练习结果已记录', 'success');
  }

  function openQAddModal() {
    const S = Store.state;
    if (!S.courses.length) { toast('请先到「知识树」创建课程和知识点', 'error'); return; }
    openModal(`
    <div class="modal-head">手动加题</div>
    <form id="f-qadd">
      <div class="modal-body">
        <div class="grid2">
          <div class="field"><label>课程</label>
            <select id="f-qadd-course" name="course">${S.courses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>知识点</label><select id="f-qadd-kp" name="kp"></select></div>
        </div>
        <div class="field"><label>题干</label><textarea name="stem" rows="3" required placeholder="例如：下列关于无穷小量的说法，正确的是？"></textarea></div>
        ${['A', 'B', 'C', 'D'].map(k => `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:9px">
          <label style="margin:0;width:20px;text-align:center;font-weight:700;color:var(--muted)">${k}</label>
          <input name="opt${k}" required placeholder="选项 ${k}" style="flex:1">
        </div>`).join('')}
        <div class="grid2">
          <div class="field"><label>正确答案</label>
            <select name="ans"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div>
          <div class="field"><label>解析（选填）</label><input name="explain" placeholder="为什么选它"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">存入题库</button>
      </div>
    </form>`);
    fillKpInto('#f-qadd-kp', S.courses[0].id);
  }

  function openQGenModal(preKpId) {
    const S = Store.state;
    if (!S.courses.length) { toast('请先到「知识树」创建课程和知识点', 'error'); return; }
    openModal(`
    <div class="modal-head">AI 批量出题</div>
    <form id="f-qgen">
      <div class="modal-body">
        <div class="grid2">
          <div class="field"><label>课程</label>
            <select id="f-qgen-course" name="course">${S.courses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>知识点</label><select id="f-qgen-kp" name="kp"></select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>题目数量</label>
            <select name="count"><option value="3" selected>3 道</option><option value="5">5 道</option><option value="8">8 道</option></select></div>
          <div class="field"><label>难度</label>
            <select name="diff"><option>基础</option><option selected>进阶</option><option>挑战</option></select></div>
        </div>
        <div class="sub">生成的题目会存入题库反复使用；答错的题建议顺手写入错题本。</div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost sm" data-act="modal-x">取消</button>
        <button class="btn primary sm" type="submit">生成并开始练习</button>
      </div>
    </form>`);
    if (preKpId) {
      const p = Engine.kp(preKpId);
      if (p) $('#f-qgen-course').value = p.courseId;
    }
    fillKpInto('#f-qgen-kp', $('#f-qgen-course').value, preKpId);
  }

  return {
    fillKpInto, startSelfTest, genAndStart, startSet,
    quizPick, quizNext, quizSelf, saveQuizResult,
    openQAddModal, openQGenModal
  };
})();
