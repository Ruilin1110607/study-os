/* 前端纯规则函数测试：跑与后端 pytest 完全相同的共享 fixture（backend/tests/fixtures/rules.json）。
   engine.js / intel.js 是浏览器 IIFE，仅函数内部引用 Store/Engine 全局，
   在 node 中加载不执行那些路径，由文件尾的 module.exports 钩子导出。 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// engine.js/intel.js 是浏览器全局脚本：先加载 util/engine 并挂到全局，intel 才能引用
globalThis.Util = require(path.join(ROOT, 'js', 'util.js'));
const Engine = require(path.join(ROOT, 'js', 'engine.js'));
globalThis.Engine = Engine;
const Intel = require(path.join(ROOT, 'js', 'intel.js'));
const RULES = JSON.parse(readFileSync(path.join(ROOT, 'backend', 'tests', 'fixtures', 'rules.json'), 'utf8'));

test('checkin 规则与共享 fixture 一致', () => {
  for (const c of RULES.checkin) {
    const p = { ...c.kp };
    const delta = Engine.checkinRules(p, c.rating, c.today);
    assert.equal(p.mastery, c.expect.mastery, c.name);
    assert.equal(p.stage, c.expect.stage, c.name);
    assert.equal(p.nextReview, c.expect.nextReview, c.name);
    assert.equal(delta, c.expect.delta, c.name);
  }
});

test('practice 规则与共享 fixture 一致', () => {
  for (const c of RULES.practice) {
    const p = { ...c.kp };
    const delta = Engine.practiceRules(p, c.isCorrect, c.today);
    assert.equal(p.mastery, c.expect.mastery, c.name);
    assert.equal(p.stage, c.expect.stage, c.name);
    assert.equal(p.nextReview, c.expect.nextReview, c.name);
    assert.equal(delta, c.expect.delta, c.name);
  }
});

test('遗忘风险与共享 fixture 一致', () => {
  for (const c of RULES.forgetting) {
    const p = { ...c.kp };
    const risk = Intel.forgettingRiskRules(p, c.accuracy, c.today);
    assert.equal(risk, c.expect.risk, c.name);
    assert.equal(Intel.riskLevel(risk), c.expect.level, c.name);
  }
});

test('优先级 mission 与共享 fixture 一致', () => {
  for (const c of RULES.mission) {
    const p = { ...c.kp };
    const m = Intel.missionRules(p, c.risk, c.course, c.today);
    assert.equal(m.score, c.expect.score, c.name);
    assert.equal(m.urgency, c.expect.urgency, c.name);
    assert.equal(m.recMin, c.expect.recMin, c.name);
    assert.equal(m.kind, c.expect.kind, c.name);
    assert.equal(m.level, c.expect.level, c.name);
    assert.deepEqual(m.reasons, c.expect.reasons, c.name);
  }
});

test('INTERVALS 与后端 common.INTERVALS 一致', () => {
  const py = readFileSync(path.join(ROOT, 'backend', 'services', 'common.py'), 'utf8');
  const m = py.match(/INTERVALS\s*=\s*\[([^\]]+)\]/);
  assert.ok(m, 'common.py 中找不到 INTERVALS');
  const pyIntervals = m[1].split(',').map(s => parseInt(s.trim(), 10));
  assert.deepEqual(Engine.INTERVALS, pyIntervals);
});

test('日期工具 addDays/diffDays 跨月与负数', () => {
  assert.equal(Engine.addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(Engine.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(Engine.diffDays('2026-08-31', '2026-09-02'), 2);
  assert.equal(Engine.diffDays('2026-09-02', '2026-08-31'), -2);
});
