# AI 带货助手

一个面向电商短视频生产的桌面客户端 + 卡密后台项目。

当前发布形态已经统一为两部分：
- 网页端：只保留管理员卡密后台，用于生成、停用、删除卡密
- Windows 客户端：普通用户输入卡密登录后使用系统，并自行填写 AI API Key

## 仓库结构

```text
.
├── backend/                # FastAPI 服务端
├── src/                    # React 前端
├── electron/               # Windows 桌面壳
├── scripts/desktop/        # 桌面打包脚本
├── deploy/                 # nginx / Docker 等部署文件
├── docs/                   # 部署与测试文档
├── desktop.config.json     # 桌面端远程 API 地址
└── package.json            # 前端与 Electron 打包入口
```

## 当前主流程

1. 管理员通过网页端登录卡密后台
2. 在后台生成普通用户卡密
3. 用户安装 Windows 客户端
4. 用户输入卡密登录
5. 用户在客户端里填写自己的 AI API Key

## 本地开发

前端：

```bash
npm install
npm run dev
```

后端：

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

后端环境变量模板：
- `backend/.env.example`
- `backend/.env.prod.example`

## Windows 安装包打包

先确认 `desktop.config.json` 指向你的服务器地址：

```json
{
  "apiBaseUrl": "http://your-server"
}
```

然后在 Windows 打包机执行：

```powershell
npm install
npm run desktop:dist
```

## 部署文件

- Linux / 国内服务器部署说明：`docs/DEPLOY_CN.md`
- Windows 测试与打包说明：`docs/DEPLOY_WINDOWS_TEST.md`
- Docker 部署文件：`deploy/docker/docker-compose.cn.yml`
- 前端容器镜像：`deploy/docker/frontend.Dockerfile`
- Nginx 反向代理示例：`deploy/nginx.app.conf`

## 说明

- 根目录的 `render.yaml` 和 `vercel.json` 仍保留，方便需要时继续接入对应平台
- `desktop.config.json` 是桌面客户端打包输入，不参与服务器部署
- `docs/archive/` 里保留了历史测试记录和旧元数据，不参与当前主流程
