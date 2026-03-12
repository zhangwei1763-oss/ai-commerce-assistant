# Windows 打包与测试

这份说明只针对两件事：
- 在 Windows 上本地测试客户端
- 在 Windows 上重新打包安装包

## 1. 环境要求

- Node.js 20+
- npm
- Python 3.10+

确认命令：

```powershell
node -v
npm -v
python --version
```

## 2. 配置桌面端服务器地址

编辑根目录 `desktop.config.json`：

```json
{
  "apiBaseUrl": "http://你的服务器地址"
}
```

## 3. 安装依赖

```powershell
cd D:\a带货助手
npm install
```

## 4. 本地调试

```powershell
npm run desktop:dev
```

如果只是跑 Web 调试页：

```powershell
npm run dev
```

## 5. 打安装包

```powershell
npm run desktop:dist
```

打包完成后产物在：

```text
release\
```

常见文件：
- `AI带货助手 Setup x.x.x.exe`
- `AI带货助手 x.x.x.exe`

## 6. 验收清单

打包后重点检查：
- 客户端能否启动
- 普通卡密能否登录客户端
- 网页端普通卡密是否会被拦为无权限
- 登录后是否要求用户自行填写 AI API Key
- 第 2 步、第 3 步最新界面是否已包含在客户端内
