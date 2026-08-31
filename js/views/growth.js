// 成长视图（原 app.js vGrowth/mapTreeHtml/assessHtml/pathHtml，忠实搬移）
const ViewsGrowth = (() => {
  const { esc, stTag } = UI;

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

  return vGrowth;
})();
