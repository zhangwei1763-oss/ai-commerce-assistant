# 国内服务器部署指南

这套项目更适合走单机容器化部署：

- 前端静态文件和反向代理由 `web` 容器负责
- 后端 FastAPI 跑在 `backend` 容器
- 数据库使用同机 `Postgres`
- 媒体文件先落本地磁盘 `deploy/data/storage`

这条路径比 `Vercel + Render + Supabase` 更适合国内用户，原因是：

- 前后端都在国内链路，页面打开和接口响应更稳定
- 同一域名下访问，不需要额外折腾跨域
- 不依赖海外平台连通性

## 推荐部署架构

适用场景：先上线、先验证业务、用户量不大到中等。

- 服务器：阿里云 ECS / 腾讯云轻量或 CVM，建议中国大陆地域
- 操作系统：`Ubuntu 22.04 LTS`
- 最低配置：`2C4G`
- 更稳妥的生产配置：`4C8G`
- 系统盘：至少 `40GB`

上面的配置是基于项目实际依赖做的工程判断，不是云厂商官方最低门槛：

- 后端包含 `ffmpeg`、`opencv-python-headless`
- 会生成和处理视频、缩略图、临时文件
- 数据库和媒体文件都在本机时，磁盘和内存比纯 CRUD 项目更重要

## 上线前必须确认

### 1. 域名和备案

如果你要让国内用户通过正式域名访问，且服务器在中国大陆，通常需要先完成 ICP 备案。

官方参考：

- 阿里云备案说明：<https://help.aliyun.com/zh/icp-filing/>
- 腾讯云备案说明：<https://cloud.tencent.com/product/ba>

如果只是临时用服务器 IP 做内部测试，可以先不走备案。

### 2. 开放端口

服务器安全组至少放行：

- `22`：SSH
- `80`：HTTP
- `443`：HTTPS

## 服务器初始化

### 1. 安装 Docker 和 Compose

官方参考：

- Docker Engine：<https://docs.docker.com/engine/install/ubuntu/>
- Docker Compose 插件：<https://docs.docker.com/compose/install/linux/>

### 2. 拉代码

```bash
git clone <你的仓库地址> ai-commerce-assistant
cd ai-commerce-assistant
```

如果你不是通过 Git 部署，也可以直接把当前项目目录上传到服务器。

## 项目内已经补好的部署文件

- [docker-compose.cn.yml](/Users/liuyanbo/Downloads/报告/ai带货助手/docker-compose.cn.yml)
- [Dockerfile.frontend](/Users/liuyanbo/Downloads/报告/ai带货助手/Dockerfile.frontend)
- [deploy/nginx.app.conf](/Users/liuyanbo/Downloads/报告/ai带货助手/deploy/nginx.app.conf)
- [backend/.env.prod.example](/Users/liuyanbo/Downloads/报告/ai带货助手/backend/.env.prod.example)

## 配置环境变量

### 1. 复制后端生产环境变量

```bash
cp backend/.env.prod.example backend/.env.prod
```

### 2. 修改 `backend/.env.prod`

至少把这些值改掉：

- `DATABASE_URL`
- `SECRET_KEY`
- `API_KEY_ENCRYPTION_KEY`
- `CORS_ORIGINS`

建议这样改：

```env
DATABASE_URL=postgresql+psycopg://ai_commerce:你的数据库密码@postgres:5432/ai_commerce
SECRET_KEY=一段足够长的随机字符串
API_KEY_ENCRYPTION_KEY=另一段足够长的随机字符串
DOUBAO_API_KEY=你的火山引擎 Ark Key
SEEDANCE_API_KEY=你的 Seedance Key
CORS_ORIGINS=["https://你的域名"]

STORAGE_BACKEND=local
STORAGE_PUBLIC_BASE_URL=
STORAGE_DIR=/app/storage
VIDEO_DIR=/app/storage/videos
IMAGE_DIR=/app/storage/images
EXPORT_DIR=/app/storage/exports
TEMP_DIR=/app/storage/tmp
```

说明：

- 前后端通过同一域名访问时，前端构建变量 `VITE_API_URL` 可以留空
- 代码会直接请求相对路径 `/api/...`
- `STORAGE_BACKEND=local` 是目前最适合这套代码的国内单机部署方式
- 当前主流程支持“用户登录后自行填写并保存 API Key”，因此 `DOUBAO_API_KEY`、`SEEDANCE_API_KEY` 对系统启动不是必填；如果先留空，页面能正常启动，但用户必须在系统里配置自己的 Key 后，AI 生成功能才能用

### 3. 设置 Compose 里的数据库密码

根目录新建 `.env`：

```env
POSTGRES_PASSWORD=你的数据库密码
VITE_API_URL=
```

注意：

- `POSTGRES_PASSWORD` 要和 `backend/.env.prod` 里的数据库密码一致
- `VITE_API_URL` 留空，表示前端走同域名反向代理

## 启动服务

### 1. 构建并启动

```bash
docker compose -f docker-compose.cn.yml up -d --build
```

### 2. 查看状态

```bash
docker compose -f docker-compose.cn.yml ps
docker compose -f docker-compose.cn.yml logs -f backend
```

### 3. 验证

```bash
curl http://127.0.0.1/health
```

如果返回：

```json
{"status":"ok"}
```

说明主链路已经通了。

## 域名接入

### 1. 先做 A 记录解析

把域名解析到这台服务器公网 IP。

### 2. HTTP 可直接访问

当前 `docker-compose.cn.yml` 默认把站点暴露在服务器 `80` 端口。

如果你已经装了宝塔、Nginx 或其他 Web 服务占用了 `80`，把 compose 里的这段：

```yaml
ports:
  - "80:80"
```

改成：

```yaml
ports:
  - "8080:80"
```

然后让你现有的 Nginx/宝塔反代到 `127.0.0.1:8080`。

## HTTPS 建议

生产环境不要长期裸跑 HTTP，尤其系统里有登录、邮箱验证码、API Key 管理。

国内更实用的做法有两种：

- 用云厂商免费 SSL 证书，加一层 Nginx / 宝塔 / SLB / CDN 做 `443` 终止
- 或者在服务器上直接用 Nginx + Certbot / Caddy 配证书

如果你已经有现成的宝塔或 Nginx，这个项目最省事的方式是：

- Docker 容器只监听 `8080`
- 外层 Nginx 监听 `443`
- `443 -> 127.0.0.1:8080`

## 数据持久化目录

下面这些目录不要删除：

- `deploy/data/postgres`
- `deploy/data/storage`

它们分别保存：

- PostgreSQL 数据
- 生成的视频、图片、导出文件、临时文件

建议把这两个目录放到定时备份里。

## 日常运维命令

重启：

```bash
docker compose -f docker-compose.cn.yml restart
```

查看后端日志：

```bash
docker compose -f docker-compose.cn.yml logs -f backend
```

查看前端日志：

```bash
docker compose -f docker-compose.cn.yml logs -f web
```

更新代码后重新部署：

```bash
git pull
docker compose -f docker-compose.cn.yml up -d --build
```

## 更适合国内用户的后续优化

当前这版先追求稳妥上线。等业务跑起来后，再考虑下面 3 项：

1. 给静态资源和视频接国内 CDN，减轻源站带宽压力
2. 把媒体存储从本地磁盘升级到对象存储
3. 把数据库从单机 Postgres 升级到云数据库

但基于当前代码，第一阶段不建议一上来就接太多云服务。先用单机部署把链路跑顺更现实。
