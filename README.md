# 学习OS (StudyOS)

AI 驱动的个人学习决策系统。**本地优先**：纯前端 + 浏览器 localStorage 即可完整使用；可选**自托管云同步**后端（FastAPI + SQLite），支持多设备登录同步与 AI 服务端代理。

线上体验（纯前端，本地模式）：https://study-os-57f.pages.dev/

## 特性

- 🧠 **智能推荐**：基于遗忘曲线和知识掌握度，自动推荐学习目标
- 📚 **知识管理**：结构化的课程、知识点、学习记录
- 📊 **数据可视化**：学习进度、错误分析、成长轨迹
- 🤖 **AI 辅助**：智能出题、学习建议、Agent 直接操作学习系统
- 🔒 **安全架构**：API Key 不回传、CORS 白名单、登录防爆破、XSS 转义
- ☁️ **同步健壮性**：失败指数退避重试、SQLite WAL、同步状态指示

## 双模式架构

| | 本地模式 | 云同步模式（自托管） |
|---|---|---|
| 数据存储 | 浏览器 localStorage | 服务端 SQLite（按用户隔离） |
| AI 调用 | 浏览器直连 AI 服务商 | 服务端代理（Key 只存服务端） |
| 多设备 | 不支持 | 支持（注册登录） |

前端自动探测：能连通后端 API 则进入云模式，否则回退本地模式，断网不影响已有数据。

## 快速开始

### 本地模式（零部署）

直接打开静态托管（如上方 Pages 地址），或任意静态服务器：

```bash
npx serve .   # 或 python -m http.server
```

首次使用走引导：添加课程 → 录入/让 AI 出题 → 在「设置」配置 AI 后解锁 Agent 与智能功能。

### 自托管云同步

环境要求：Python 3.10+

```bash
git clone https://github.com/Ruilin1110607/study-agent.git
cd study-agent
pip install -r backend/requirements.txt

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
# Windows 可直接双击 start.bat
```

浏览器访问 `http://localhost:8643`（局域网内其他设备用 `http://<你的IP>:8643`）。

> ⚠️ `--host 0.0.0.0` 会把服务暴露给整个局域网，仅建议在可信网络使用；只在本机运行请改用 `--host 127.0.0.1`。

可选环境变量：
- `STUDYOS_DB`：SQLite 数据文件路径（默认 `backend/studyos.db`）
- `STUDYOS_CORS_ORIGINS`：CORS 白名单，逗号分隔；默认为空（同源部署无需跨域）

### Cloudflare Pages 部署（纯前端）

仓库根目录的 `index.html` + `css/` + `js/` 即为完整静态站点，直接部署到任意静态托管即可（`wrangler pages deploy . --project-name study-os`）。

## 测试

```bash
# 后端（pytest，23 个用例：安全/状态同步/限流/引擎规则）
cd backend && python -m pytest

# 前端（node:test，零依赖）
npm test          # 即 node --test tests/js/

# 前后端共享规则 fixture（锁定两端引擎行为一致）
# backend/tests/fixtures/rules.json —— 同一份数据两端都跑
```

## 目录结构

```
study-agent/
├── index.html        # 入口（按依赖顺序加载模块）
├── css/              # 样式
├── js/               # 前端（无构建，IIFE + 全局命名空间）
│   ├── app.js        # 装配层：视图路由 + 登录引导（<100 行）
│   ├── store.js      # 状态 + 同步（重试/回退）
│   ├── engine.js / intel.js / profiler.js / assessor.js  # 纯函数引擎
│   ├── views/        # 8 个视图模块
│   ├── events.js / actions.js / agent.js / quiz.js / modals.js / ui.js
│   └── data/         # 培养方案常量
├── backend/          # FastAPI 后端
│   ├── main.py       # 应用 + 静态托管
│   ├── database.py / models.py / schemas.py / security.py / rate_limit.py
│   ├── routers/      # auth / state / state_apply / ai / knowledge
│   ├── services/     # AI 服务商适配
│   └── tests/        # pytest + 共享 fixture
└── tests/js/         # 前端 node:test
```

## 许可证

[MIT](LICENSE)
