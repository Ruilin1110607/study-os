// UI 基础工具与共享运行时标志：由 app 拆分的各模块统一引用
const UI = (() => {
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

  const DAYNAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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

  const TAGC = { '到期复习': 'amber', '薄弱推进': 'blue', '新学': 'green', '练习': 'purple', '休息': 'gray', '事务': 'gray', '其他': 'gray' };
  const tagCls = t => TAGC[t] || 'gray';
  const mTag = m => m >= 80 ? 'green' : m >= 60 ? 'blue' : m >= 35 ? 'amber' : 'red';
  const stTag = s => ({ '优秀': 'green', '良好': 'blue', '一般': 'amber', '需警惕': 'red' }[s] || 'gray');

  // 跨模块共享的忙标志：AI 请求互斥 / 计划生成互斥 / 对话进行中
  const flags = { ai: false, gen: false, chat: false };

  return { $, $$, esc, mdToHtml, DAYNAMES, toast, openModal, closeModal, guardAI, TAGC, tagCls, mTag, stTag, flags };
})();
