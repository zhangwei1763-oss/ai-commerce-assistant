# Linux 部署说明

推荐正式环境使用 `Ubuntu 22.04 + Python venv + systemd + nginx`。

当前项目的真实上线结构是：
- `backend/` 提供统一卡密后台和业务 API
- `dist/` 提供网页端管理员后台静态资源
- Windows 客户端通过 `desktop.config.json` 直连服务器 API

## 1. 拉代码

```bash
git clone https://github.com/zhangwei1763-oss/ai-commerce-assistant.git
cd ai-commerce-assistant
```

## 2. 构建前端

```bash
npm install
npm run build
```

## 3. 配置后端

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.prod.example .env
```

`backend/.env` 至少要填：

```env
DATABASE_URL=sqlite:///./ai_douyin_helper.db
SECRET_KEY=替换成随机串
API_KEY_ENCRYPTION_KEY=替换成随机串
BOOTSTRAP_ADMIN_CARD_KEY=ADMN-8888-9999-AAAA
BOOTSTRAP_ADMIN_CARD_NAME=系统管理员
CORS_ORIGINS=["http://你的域名","app://local"]
SERVE_FRONTEND=true
FRONTEND_DIST_DIR=../dist
```

说明：
- `BOOTSTRAP_ADMIN_CARD_KEY` 是首张管理员卡密
- 普通用户不需要服务器预置 AI Key，用户登录客户端后自行填写

## 4. 本机验证

```bash
cd backend
./.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

验证：

```bash
curl http://127.0.0.1:8000/health
```

## 5. systemd

示例服务：

```ini
[Unit]
Description=AI Helper FastAPI Service
After=network.target

[Service]
WorkingDirectory=/opt/ai-helper/backend
ExecStart=/opt/ai-helper/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

常用命令：

```bash
systemctl daemon-reload
systemctl enable ai-helper
systemctl restart ai-helper
systemctl status ai-helper
journalctl -u ai-helper -f
```

## 6. nginx

可参考：
- `deploy/nginx.app.conf`

核心就是把 `80/443` 反代到：

```text
127.0.0.1:8000
```

## 7. 可选 Docker 文件

仓库里仍保留 Docker 版本文件，便于后续容器化：
- `deploy/docker/docker-compose.cn.yml`
- `deploy/docker/frontend.Dockerfile`

使用时：

```bash
docker compose -f deploy/docker/docker-compose.cn.yml up -d --build
```
