<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI 带货助手

AI 驱动的短视频带货内容生成工具，支持脚本生成、视频生成、爆款分析等功能。

## 功能特性

- 📦 产品信息录入与管理
- ✍️ AI 智能脚本生成（多种风格选择）
- 🎬 视频自动生成（图生视频）
- 🔥 爆款视频分析与脚本裂变
- 🎨 提示词模板管理

## 技术栈

### 前端
- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4

### 后端
- Python FastAPI
- SQLAlchemy
- SQLite / Supabase Postgres

### AI 集成
- 豆包 AI（火山引擎 Ark）
- Seedance（图生视频）

## 本地运行

### 前置要求
- Node.js 20+
- Python 3.11+

### 安装依赖

```bash
# 前端
npm install

# 后端
cd backend
pip install -r requirements.txt
```

### 配置环境变量

复制根目录 `.env.example` 为 `.env.local`（前端）并配置：

```env
# 前端访问后端的基地址
# 本地开发可留空，继续使用 Vite 代理
# Vercel 部署时填你的后端地址，例如 https://api.xxx.com
VITE_API_URL=

# 豆包 API
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_API_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=ep-202502xxxxx

# Seedance API
SEEDANCE_API_KEY=your_seedance_api_key
SEEDANCE_API_URL=https://api.seedance.com/v1
```

后端请复制 `backend/.env.example` 为 `backend/.env`，至少配置数据库、安全密钥和 SMTP。

本地 SQLite 示例：

```env
DATABASE_URL=sqlite:///./ai_douyin_helper.db
SECRET_KEY=replace_with_a_long_random_secret
API_KEY_ENCRYPTION_KEY=replace_with_a_long_random_encryption_key
```

Supabase Postgres 示例：

```env
DATABASE_URL=postgresql+psycopg://postgres.xxxxx:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
SECRET_KEY=replace_with_a_long_random_secret
API_KEY_ENCRYPTION_KEY=replace_with_a_long_random_encryption_key
CORS_ORIGINS=["http://localhost:3000","https://your-frontend.vercel.app"]
```

如果还要把媒体文件迁到 Supabase Storage，后端再加：

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=ai-douyin-helper

# 如果仍使用本地存储并想让前端拿到完整可访问地址，可填后端公网域名
STORAGE_PUBLIC_BASE_URL=https://your-backend-domain.com
```

说明：

- `STORAGE_BACKEND=local` 时，后端继续通过 `/storage/...` 提供本地文件
- `STORAGE_BACKEND=supabase` 时，后端会把新生成的视频、缩略图、关键帧、导出草稿上传到 Supabase Storage，并在数据库中保存公网地址
- `SUPABASE_STORAGE_BUCKET` 建议创建为 `public bucket`，这样前端可以直接访问返回的资源 URL

历史文件迁移命令：

```bash
cd backend
./.venv/bin/python scripts/migrate_storage_to_supabase.py --dry-run
STORAGE_BACKEND=supabase ./.venv/bin/python scripts/migrate_storage_to_supabase.py --yes
```

如果要启用邮箱验证码注册，还需要在 `backend/.env` 里继续配置 SMTP：

```env
SMTP_HOST=
SMTP_PORT=465
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=AI带货助手
SMTP_USE_TLS=false
SMTP_USE_SSL=true
```

常见邮箱服务商参考：

- `QQ邮箱`
  - `SMTP_HOST=smtp.qq.com`
  - `SMTP_PORT=465`
  - `SMTP_USERNAME=你的QQ邮箱`
  - `SMTP_PASSWORD=SMTP授权码`
  - `SMTP_FROM_EMAIL=你的QQ邮箱`
  - `SMTP_USE_SSL=true`
- `163邮箱`
  - `SMTP_HOST=smtp.163.com`
  - `SMTP_PORT=465`
  - `SMTP_USERNAME=你的163邮箱`
  - `SMTP_PASSWORD=客户端授权码`
  - `SMTP_FROM_EMAIL=你的163邮箱`
  - `SMTP_USE_SSL=true`
- `Gmail`
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=587`
  - `SMTP_USERNAME=你的Gmail`
  - `SMTP_PASSWORD=App Password`
  - `SMTP_FROM_EMAIL=你的Gmail`
  - `SMTP_USE_TLS=true`
  - `SMTP_USE_SSL=false`

说明：

- `SMTP_PASSWORD` 不是邮箱网页登录密码，通常是 SMTP/客户端授权码或 App Password。
- 如果这些参数不填，系统会继续走开发模式，接口会返回 `dev_code`，但不会真的发邮件。

### 启动服务

```bash
# 启动前端（端口 3000）
npm run dev

# 启动后端（端口 8000）
cd backend
uvicorn main:app --reload --port 8000
```

## Vercel + Supabase 部署

### 第 1 阶段：前端部署到 Vercel

项目已经补好 `vercel.json` 和 `VITE_API_URL` 支持。

在 Vercel 中这样配置：

```bash
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Vercel 环境变量至少设置：

```env
VITE_API_URL=https://your-backend-domain.com
```

### 后端先部署到 Render

仓库已经补好了：

- [backend/Dockerfile](/Users/liuyanbo/Downloads/报告/ai带货助手/backend/Dockerfile)
- [render.yaml](/Users/liuyanbo/Downloads/报告/ai带货助手/render.yaml)

推荐直接用 Render Blueprint / Web Service 导入这个仓库。

最短路径：

1. 打开 Render 控制台，点击 `New +` -> `Blueprint`
2. 连接 GitHub 仓库 `zhangwei1763-oss/ai-commerce-assistant`
3. Render 会识别根目录的 `render.yaml`
4. 在创建页面填写所有 `sync: false` 的环境变量
5. 创建后等待后端部署完成，拿到类似：
   `https://ai-commerce-backend.onrender.com`
6. 回到 Vercel，把前端环境变量设置为：
   `VITE_API_URL=https://ai-commerce-backend.onrender.com`
7. 重新部署前端

如果你不用 Blueprint，也可以在 Render 手动创建 `Web Service`：

- Runtime: `Docker`
- Dockerfile Path: `./backend/Dockerfile`
- Docker Context: `./backend`
- Health Check Path: `/health`
- Region: `Singapore`
- Port: `10000`

### 第 2 阶段：数据库切到 Supabase

后端已经支持 `postgresql+psycopg://...` 连接串，依赖也已补上 `psycopg[binary]`。

你需要在 Supabase 中：

1. 创建项目
2. 获取 Postgres 连接串
3. 写入 `backend/.env` 的 `DATABASE_URL`
4. 把前端域名加入 `CORS_ORIGINS`
5. 部署后端并执行一次建表初始化

### 第 3 阶段当前状态

前端工作流实际依赖的这些接口已经可由正式 FastAPI 后端提供：

- `/api/test-key`
- `/api/generate-scripts`
- `/api/analyze-viral-video`
- `/api/derive-viral-scripts`
- `/api/generate-video`
- `/api/video-status`

其中 `vite.config.ts` 里仍保留了一份本地开发中间件实现，主要用于你在 `localhost:3000` 直接跑前端时继续同源调试；生产部署时应让前端通过 `VITE_API_URL` 指向独立后端。

### 当前剩余的部署改造

现在真正还没完成的，是运行时基础设施层：

- 现有代码已支持把新生成媒体写到 Supabase Storage，但历史本地文件不会自动迁移
- `剪映草稿导出` 和旧版 `FFmpeg` 去重链路仍依赖本地临时文件，部署前要确认目标 Python 平台支持较长任务和临时文件写入
- 如果要把历史 `storage/` 中的旧媒体一并搬到 Supabase，可直接使用 `backend/scripts/migrate_storage_to_supabase.py`

## 国内服务器部署

如果你的主要用户在国内，不建议优先走 `Vercel + Render` 这条链路。仓库里已经补了一套适合国内单机服务器的部署文件，优先看这份文档：

- [DEPLOY_CN.md](/Users/liuyanbo/Downloads/报告/ai带货助手/DEPLOY_CN.md)
- [DEPLOY_WINDOWS_TEST.md](/Users/liuyanbo/Downloads/报告/ai带货助手/DEPLOY_WINDOWS_TEST.md)

这套方案的特点：

- 前后端同域名访问
- 使用 Docker Compose 一次拉起前端、后端、Postgres
- 先用本地磁盘存媒体文件，部署难度最低
- 更适合中国大陆服务器和国内用户访问

## 项目结构

```
.
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   └── steps/          # 各步骤组件
│   └── App.tsx             # 主应用
├── backend/                # 后端源码
│   ├── api/                # API 集成
│   ├── services/           # 业务服务
│   ├── utils/              # 工具函数
│   ├── models.py           # 数据模型
│   └── main.py             # FastAPI 入口
└── vite.config.ts          # Vite 配置
```

## License

MIT
