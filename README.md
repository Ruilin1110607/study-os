# 学习OS (StudyOS)

AI 驱动的个人学习决策系统，基于本地优先架构，支持云端同步。

## 特性

- 🧠 **智能推荐**：基于遗忘曲线和知识掌握度，自动推荐学习目标
- 📚 **知识管理**：结构化的课程、知识点、学习记录
- 📊 **数据可视化**：学习进度、错误分析、成长轨迹
- 🤖 **AI 辅助**：智能出题、学习建议、个性化路径规划
- 🔒 **安全架构**：API Key 不回传、CORS 收紧、登录防爆破
- 🌐 **双模式**：本地优先（默认）+ 云同步（自托管）

## 快速开始

1. **本地运行**：
   ```bash
   # 启动后端（自托管模式）
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
   
   # 或使用 start.bat（Windows）
   start.bat
   ```

2. **浏览器访问**：
   ```
   http://localhost:8643
   ```

3. **首次使用**：
   - 注册账号
   - 配置 AI 设置（API Key、模型等）
   - 添加课程和知识点
   - 开始学习！

## 自托管部署

### 环境要求
- Python 3.8+
- Node.js 18+

### 步骤
1. 克隆仓库：
   ```bash
   git clone https://github.com/Ruilin1110607/study-agent.git
   cd study-agent
   ```

2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   npm install
   ```

3. 启动服务：
   ```bash
   # 启动后端
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
   
   # 或使用 start.bat（Windows）
   start.bat
   ```

4. 访问：
   ```
   http://your-server:8643
   ```

## 测试

运行测试确保功能正常：
```bash
# 后端测试
cd backend
pytest

# 前端测试
cd js
node --test tests/js/
```

## 目录结构

```
study-agent/
├── backend/          # FastAPI 后端
│   ├── database.py   # 数据库模型
│   ├── main.py       # 主应用
│   └── routers/     # API 路由
├── js/              # 前端代码
│   ├── app.js       # 应用装配层
│   ├── views/       # 视图模块
│   └── tests/       # 前端测试
├── css/             # 样式文件
├── static/          # 静态资源
└── README.md       # 说明文档
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！