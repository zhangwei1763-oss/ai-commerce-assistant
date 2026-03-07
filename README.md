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
- SQLite

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

复制 `.env.example` 为 `.env` 并配置：

```env
# 豆包 API
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_API_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=ep-202502xxxxx

# Seedance API
SEEDANCE_API_KEY=your_seedance_api_key
SEEDANCE_API_URL=https://api.seedance.com/v1
```

### 启动服务

```bash
# 启动前端（端口 3000）
npm run dev

# 启动后端（端口 8000）
cd backend
uvicorn main:app --reload --port 8000
```

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
