// 设置视图（原 app.js vSettings，忠实搬移）
const ViewsSettings = (() => {
  const { esc } = UI;

  function vSettings() {
    const S = Store.state;
    const p = S.profile;
    const api = S.api;
    const GOALS = ['保研 · 高绩点', '考研备战', '通过期末', '技能提升', '留学申请'];
    const goalOpts = GOALS.map(g => `<option ${p.goal === g ? 'selected' : ''}>${g}</option>`).join('')
      + (p.goal && !GOALS.includes(p.goal) ? `<option selected>${esc(p.goal)}</option>` : '');
    const presetOpts = Object.entries(AI.PRESETS)
      .map(([k, v]) => `<option value="${k}" ${api.preset === k ? 'selected' : ''}>${v.label}</option>`).join('');
    const curPreset = AI.PRESETS[api.preset];
    const cloud = Store.transport === 'api';
    const acctCard = cloud ? `
    <div class="card">
      <div class="card-head"><h3>账户与同步</h3></div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span>当前账户：<b>${esc(p.name || '用户')}</b></span>
        <span class="tag green">云同步已开启</span>
        <span class="grow"></span>
        <button class="btn ghost sm" data-act="logout">退出登录</button>
      </div>
      <div class="sub" style="margin-top:10px">学习数据实时保存到服务器数据库，换设备登录同一账号即可继续；API 配置也随账户走。</div>
    </div>` : '';
    return `
    <div class="page-head"><div><h1>设置</h1></div></div>

    ${acctCard}

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
        ${cloud
          ? `<div class="field"><label>API Key${api.keySet ? '（已保存在服务器）' : ''}</label><input id="f-key" type="password" value="" placeholder="${api.keySet ? '已配置，留空表示不修改' : 'sk-...'}"></div>`
          : '<div class="field"><label>API Key（仅保存在本机浏览器）</label><input id="f-key" type="password" value="' + esc(api.key) + '" placeholder="sk-..."></div>'}
        ${curPreset && curPreset.keyUrl ? `<div class="sub" style="margin:-8px 0 12px"><a href="${curPreset.keyUrl}" target="_blank" rel="noopener" style="color:var(--brand)">去获取 ${esc(curPreset.label.split('（')[0])} 的 API Key ↗</a>　Gemini / 智谱均有免费额度</div>` : '<div class="sub" style="margin:-8px 0 12px">选择服务商后，这里会出现申请 Key 的直达链接</div>'}
        <div style="display:flex;gap:10px">
          <button class="btn primary sm" type="submit">保存配置</button>
          <button class="btn ghost sm" type="button" data-act="api-test">测试连接</button>
          ${cloud && api.keySet ? '<button class="btn ghost sm" type="button" data-act="api-clear-key">清除已存 Key</button>' : ''}
        </div>
        <div class="sub" style="margin-top:10px">Agent 需要接入一个 AI 服务才能对话与智能出题；推荐 Gemini（免费 Key）或 DeepSeek（便宜）。${cloud
          ? '当前为云同步模式：Key 只保存在服务器数据库、不会回传浏览器，AI 请求由后端代理转发。'
          : '当前为本机模式：Key 只存本机浏览器，请求直连服务商。'}未接入时学习OS以本地智能引擎运行，规划、复习排期与快速自测不受影响。</div>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><h3>数据管理</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost sm" data-act="export">导出备份</button>
        <button class="btn ghost sm" data-act="import-btn">导入备份</button>
        <button class="btn ghost sm" data-act="demo-load">载入试用数据</button>
        <button class="btn danger sm" data-act="wipe">清空学习数据</button>
        <input type="file" id="import-file" accept=".json" style="display:none">
      </div>
      <div class="sub" style="margin-top:10px">清空不会清除 API 配置。所有数据仅保存在本机，换电脑前记得导出备份。</div>
    </div>`;
  }

  return vSettings;
})();
