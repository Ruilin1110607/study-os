// 弹窗集合（原 app.js 各 open* / onboard / importMap / 打卡流程，忠实搬移）
const Modals = (() => {
  const { $, $$, esc, toast, openModal, closeModal, stTag, DAYNAMES } = UI;

  let ckCtx = null;

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

  function openWelcome() {
    openModal(`
    <div class="modal-head">欢迎使用 学习OS</div>
    <div class="modal-body">
      <p class="sm muted" style="line-height:1.9;margin-bottom:6px">这是你的<b>个人学习操作系统</b>：记录学习 → 分析薄弱 → 规划行动，它会主动告诉你今天最该学什么。</p>
      <p class="sm muted" style="line-height:1.9">建议先载入一套试用数据（含课程、题库、练习记录、课表等），30 秒看懂全部功能。</p>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button class="btn primary sm" data-act="welcome-demo">🚀 载入试用数据</button>
        <button class="btn ghost sm" data-act="welcome-blank">从零开始，先设定目标</button>
      </div>
      <div class="sub" style="margin-top:14px">试用数据随时可在「设置 → 数据管理」清除或导出。</div>
    </div>`);
  }

  function onboard() {
    const GOALS = ['保研 · 高绩点', '考研备战', '通过期末', '技能提升', '留学申请'];
    openModal(`
    <div class="modal-head">欢迎来到 学习OS</div>
    <form id="f-onboard">
      <div class="modal-body">
        <p class="muted sm" style="margin-bottom:14px">告诉我你的目标，Study Agent 会据此为你规划每天的学习。${Store.transport === 'api' ? '数据将保存到服务器，登录同一账号即可多设备继续。' : '所有数据只保存在本机浏览器。'}</p>
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

  function openAuthModal(mode) {
    const isReg = mode === 'reg';
    openModal(`
    <div class="modal-head">学习OS 账户</div>
    <form id="f-auth" data-mode="${isReg ? 'register' : 'login'}">
      <div class="modal-body">
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button type="button" class="btn sm ${isReg ? 'ghost' : 'primary'}" data-act="auth-tab" data-m="login">登录</button>
          <button type="button" class="btn sm ${isReg ? 'primary' : 'ghost'}" data-act="auth-tab" data-m="reg">注册新账户</button>
        </div>
        <div class="field"><label>用户名</label><input name="username" required autocomplete="username"></div>
        <div class="field"><label>密码（至少 8 位）</label><input name="password" type="password" required minlength="8" autocomplete="${isReg ? 'new-password' : 'current-password'}"></div>
        ${isReg ? '<div class="field"><label>昵称（可选）</label><input name="display_name" placeholder="怎么称呼你？"></div>' : ''}
        <div id="auth-err" class="sm" style="color:var(--red);min-height:18px;margin-bottom:6px"></div>
        <div class="sub">已检测到本地后端服务：学习数据将保存到服务器数据库，换设备登录即可继续。</div>
      </div>
      <div class="modal-foot">
        <button class="btn primary sm" type="submit">${isReg ? '注册并进入' : '登录'}</button>
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
          <button type="button" data-act="ck-rate" data-r="good" class="on">掌握了</button>
          <button type="button" data-act="ck-rate" data-r="ok">有点模糊</button>
          <button type="button" data-act="ck-rate" data-r="bad">没学会</button>
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
    fillKpSelect($('#f-mk-course').value || (S.courses[0] && S.courses[0].id), preKpId);
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
      ['🎯', '主动回忆练习室', 'AI 按知识点出选择题（也可手动加题、快速自测）；智能推荐今天最值得练的目标，答错自动回流错题本与复习队列。'],
      ['📊', '学习数据全景', '连续天数、时长趋势、各科掌握度、瓶颈 TOP3；AI 周报解读状态，考试风险提前预测。'],
      ['📈', '后台自动体检', '打开网页即自动评估近期学习状态：拖延了吗？时间失衡吗？哪些知识点在反复出错？结论直达通知中心。'],
      ['🗺️', '知识地图 + 成长路径', '选专业生成知识地图（支持粘贴培养方案解析）；设定长期目标，AI 倒推里程碑并反哺每日计划。'],
      ['🧰', '核心四件套', '课程表（支持单双周）· 番茄钟（25 分钟专注循环）· 待办清单 · 考试倒计时，日常刚需一个不少。'],
      ['💬', 'Study Agent 随时问', '"我只有 1 小时该怎么安排？""我最近哪里最薄弱？"右下角唤出对话框，它看得见你的所有数据，答得有理有据。']
    ];
    openModal(`
    <div class="modal-head">学习OS <span class="muted sm" style="font-weight:400">v3.0 · Personal Learning OS</span></div>
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

  return {
    openNotif, openMapGenModal, openMapParseModal, importMap,
    openWelcome, onboard, openAuthModal,
    openCheckin, setRate, saveCheckin,
    openReplan, openTaskModal, openCourseModal, openKpModal,
    fillKpSelect, openMistakeModal, openSchedModal, openCdModal, openAbout
  };
})();
