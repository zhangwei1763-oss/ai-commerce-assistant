# Windows ECS 试用部署指南

这份文档适合：

- 阿里云 `ECS` 免费试用实例
- 操作系统是 `Windows Server`
- 目标只是先让公网能访问系统，验证功能是否能跑通

不建议在这个场景继续用仓库里的 Docker 方案，原因很直接：

- 当前部署文件基于 Linux 镜像
- [backend/Dockerfile](/Users/liuyanbo/Downloads/报告/ai带货助手/backend/Dockerfile) 使用 `python:3.11-slim`
- [Dockerfile.frontend](/Users/liuyanbo/Downloads/报告/ai带货助手/Dockerfile.frontend) 使用 `node:20-alpine` 和 `nginx:alpine`

所以在 Windows 试用机上，最省事的路线是：

1. 原生安装 `Python`、`Node.js`、`FFmpeg`
2. 构建前端
3. 让 FastAPI 直接托管前端 `dist`
4. 对外只开放 `8000` 端口

## 0. 阿里云实例怎么选

如果你还没创建实例，建议：

- 镜像：普通 `Windows Server 2022` 或 `Windows Server 2025`
- 不要选 `with Container` 版本
- 配置：能选到的最高配置即可，优先 `2C4G`

阿里云官方免费试用入口：

- <https://free.aliyun.com/>
- <https://free.aliyun.com/product/product/ecs/freetrial>

## 1. 先开公网访问

在阿里云控制台安全组里，入方向至少放行：

- `3389`：远程桌面
- `8000`：应用访问

然后在 Windows 服务器里，再放行本机防火墙：

```powershell
New-NetFirewallRule -DisplayName "AICommerce-8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000
```

## 2. 安装基础软件

先打开 `PowerShell`。

### 方案 A：系统带 `winget`

先试：

```powershell
winget --version
```

如果有输出，就执行：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.11 -e
winget install --id Gyan.FFmpeg -e
```

### 方案 B：没有 `winget`

如果提示 `winget` 不存在，就直接在 Windows 服务器里用浏览器下载并安装：

- Git for Windows：<https://git-scm.com/download/win>
- Node.js LTS：<https://nodejs.org/en/download>
- Python 3.11：<https://www.python.org/downloads/windows/>
- FFmpeg Windows Build：<https://www.gyan.dev/ffmpeg/builds/>

安装要求：

- Python 安装时勾选 `Add python.exe to PATH`
- FFmpeg 解压后，把 `bin` 目录加入系统 `PATH`

安装后重新打开 PowerShell，确认：

```powershell
git --version
node -v
npm -v
python --version
ffmpeg -version
```

## 3. 拉取项目

这个仓库已经有远程地址，可以直接拉：

```powershell
cd C:\
git clone https://github.com/zhangwei1763-oss/ai-commerce-assistant.git
cd C:\ai-commerce-assistant
```

如果 GitHub 下载太慢，也可以先在你本机把项目打包，再传到 Windows 服务器。

## 4. 配后端环境变量

后端原生启动时，配置文件读的是 `backend\.env`，不是 Docker 用的 `.env.prod`。

复制模板：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

生成两段随机密钥：

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

编辑 `backend\.env`：

```powershell
notepad .\backend\.env
```

至少改成下面这样：

```env
DATABASE_URL=sqlite:///./ai_douyin_helper.db
SECRET_KEY=替换成随机串1
API_KEY_ENCRYPTION_KEY=替换成随机串2
CORS_ORIGINS=["http://你的公网IP:8000"]

DOUBAO_API_KEY=你的火山引擎Ark密钥
SEEDANCE_API_KEY=你的Seedance密钥

STORAGE_BACKEND=local
STORAGE_DIR=./storage
VIDEO_DIR=./storage/videos
IMAGE_DIR=./storage/images
EXPORT_DIR=./storage/exports
TEMP_DIR=./storage/tmp

SERVE_FRONTEND=true
FRONTEND_DIST_DIR=../dist
```

说明：

- 测试环境直接用 `SQLite` 最简单，不用装 `Postgres`
- `SERVE_FRONTEND=true` 表示让 FastAPI 直接托管前端构建产物
- 如果你暂时没有 `DOUBAO_API_KEY` 或 `SEEDANCE_API_KEY`，系统能启动，但对应 AI 功能不可用

## 5. 安装后端依赖

```powershell
cd C:\ai-commerce-assistant\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt
```

## 6. 构建前端

前端和后端走同一个端口，所以这里不要设置 `VITE_API_URL`。

```powershell
cd C:\ai-commerce-assistant
npm install
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
npm run build
```

构建完成后，应该能看到：

- `C:\ai-commerce-assistant\dist\index.html`

## 7. 启动服务

```powershell
cd C:\ai-commerce-assistant\backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

如果启动成功，浏览器直接访问：

- `http://你的公网IP:8000`

接口文档：

- `http://你的公网IP:8000/docs`

健康检查：

- `http://你的公网IP:8000/health`

## 8. 先验证 3 件事

1. 首页能不能打开
2. `/docs` 能不能打开
3. 后端日志里有没有报错

在服务器本机也可以先测：

```powershell
curl http://127.0.0.1:8000/health
```

## 9. 常见问题

### 页面打不开

优先检查：

- 阿里云安全组有没有放行 `8000`
- Windows 防火墙有没有放行 `8000`
- `uvicorn` 进程是不是还在运行

### 页面打开了，但 AI 生成功能报错

一般是：

- `DOUBAO_API_KEY` 没填
- `SEEDANCE_API_KEY` 没填
- 服务器访问外部 API 不通

### 视频或图片处理失败

优先检查：

```powershell
ffmpeg -version
```

如果没有输出版本号，说明 `FFmpeg` 没装好或没进 `PATH`。

## 10. 测试跑通后再做什么

如果这一步跑通了，下一阶段再做：

1. 切到 Linux 服务器长期运行
2. 上域名和备案
3. 把 `8000` 改成 `80/443`
4. 加反向代理和 HTTPS
