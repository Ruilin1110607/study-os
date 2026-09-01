# StudyOS v3.1 版本更新说明

> 发布日期：2026-09-01 · 上一版本：v3.0
> 本轮主题：**工程全修** —— 安全加固、测试基建、代码模块化、同步健壮化、文档收尾。界面功能保持不变，底座全面升级。

## 在线地址

- 纯前端体验（本地模式）：https://study-os-57f.pages.dev/
- 自托管云同步：按 README 部署 FastAPI 后端

---

## 一、安全加固 🔒

**API Key 全面保护**
- API Key 不再出现在任何接口响应中（`GET /api/state` 只返回 `keySet: true/false`），明文 Key 只存服务端
- Key 不再随整包数据同步往返——每次同步不会清空服务端已有 Key
- 新增 `POST /api/ai/config`：Key 仅在显式提供时更新，支持 `clearKey` 清除
- 设置页云模式下 Key 输入框不再回填明文（占位提示"已保存在服务器，留空不修改"），侧栏 AI 状态改用服务端真实状态

**接口与历史清理**
- CORS 从"允许所有来源"收紧为环境变量白名单（`STUDYOS_CORS_ORIGINS`），同源部署默认无需跨域
- 登录接口增加防爆破限流：IP+用户名维度，5 分钟内最多 10 次，超出返回 429
- 注册密码最短长度 6 → 8 位
- 整包同步落库防御：非法数据条目跳过而非抛 500（避免同步失败导致用户数据丢失风险）
- 补齐 Agent 确认卡片中知识点标题/约束文本的 XSS 转义
- **Git 全历史清理**：从所有历史提交中移除 `.wrangler/` 缓存目录

## 二、测试基建 ✅

- **后端 pytest 23 个用例**：注册/登录/JWT 安全、整包同步往返与容错、Key 不回传、登录限流、三引擎规则
- **前端 node:test 6 个用例**（零依赖，`npm test`）：引擎/智能推荐纯函数
- **前后端共享规则 fixture**（`backend/tests/fixtures/rules.json`）：同一份输入/期望输出，pytest 与 node:test 都跑，锁定两端规则引擎行为一致、防止漂移
- **GitHub Actions CI**：push/PR 自动跑两套测试

## 三、代码工程化 🏗️

**app.js 拆分：2710 行 → 装配层不足 100 行**

保持无构建原生 JS（IIFE + 全局命名空间），拆分为按依赖顺序加载的模块：

| 模块 | 职责 |
|---|---|
| `js/app.js` | 装配层：视图路由 + 登录引导 |
| `js/views/` | 8 个视图模块（今日计划/知识树/练习室/错题本/学习数据/成长/工具箱/设置） |
| `js/events.js` | 事件分发（原 ~560 行 switch） |
| `js/agent.js` | Agent 确认卡片与动作执行 |
| `js/quiz.js` | 出题测验状态机 |
| `js/modals.js` / `js/ui.js` | 弹窗 / 转义·渲染·toast 等通用 UI |
| `js/actions.js` / `js/data/` | 业务动作 / 培养方案常量 |

**重复代码收敛**
- 新建 `js/util.js`：日期格式化、uid 等工具函数单一实现，engine/profiler/store 统一引用
- 后端怪写法清理（f-string SQL 拼接、运行时 `__import__` 等）
- 种子演示数据硬编码内容提取为常量

## 四、同步健壮化 ☁️

- **失败自动重试**：云同步推送失败后按 1s → 2s → 4s 指数退避重试，并以 toast 告知
- **同步状态指示**：侧栏新增同步状态点（含重试中脉冲动画），一眼看出当前连接状态
- **SQLite WAL 模式** + 30s busy_timeout：缓解多设备并发读写锁冲突（本轮修复了 WAL 配置本身的实现错误，已通过全部测试）

## 五、文档与收尾 📄

- **README 重写**：双模式架构对比、本地/自托管/Pages 三种部署方式、环境变量说明、真实目录结构
- 新增 **MIT LICENSE**；`requirements.txt` 锁定精确版本，新增 `requirements-dev.txt`
- `.gitignore` 补全（WAL 文件、pytest 缓存、venv、node_modules）；`start.bat` 加局域网暴露风险注释

---

## 升级须知

- **纯前端用户**：无需任何操作，刷新页面即为 v3.1
- **自托管用户**：
  ```bash
  git pull
  pip install -r backend/requirements.txt   # 版本已锁定
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
  ```
- 数据格式无变更，旧数据自动兼容；Git 历史已重写，其他设备如曾 clone 过旧仓库需重新 clone

## 后续规划（未包含在本版本）

事件式增量同步（当前为整包同步）、FSRS 记忆调度、AI 流式输出、公网托管部署。
