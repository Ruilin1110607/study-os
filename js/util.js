// 日期与 id 工具的单一实现：engine/profiler/store 统一从这里引用（此前三处各自复制了一份）
const Util = (() => {
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dstr(new Date());
  const addDays = (str, n) => {
    const d = new Date(str + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return dstr(d);
  };
  const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return { pad, dstr, today, addDays, diffDays, uid };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Util;
