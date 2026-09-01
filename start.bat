@echo off
rem StudyOS 一键启动：后端 API + 网页同端口（局域网内手机也可访问）
rem 注意：--host 0.0.0.0 会把服务暴露到整个局域网，仅建议在可信网络使用；
rem       若只在本机使用，可改为 --host 127.0.0.1
start "" http://localhost:8643/
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8643
