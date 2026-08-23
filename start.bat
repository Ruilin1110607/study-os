@echo off
rem StudyOS 一键启动：后端 API + 网页同端口（局域网内手机也可访问）
start "" http://localhost:8643/
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
