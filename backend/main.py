"""
FastAPI 主入口
注册所有路由、配置 CORS 中间件、启动时初始化数据库和存储目录。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db

# ──────────────────────────────────────────────
# 创建 FastAPI 应用
# ──────────────────────────────────────────────
app = FastAPI(
    title="AI带货助手 API",
    description="集成豆包大模型 + Seedance 2.0，一站式带货短视频脚本生成与视频生产平台",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ──────────────────────────────────────────────
# CORS 跨域配置
# ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# 注册业务路由
# ──────────────────────────────────────────────
from services.product_service import router as product_router
from services.script_service  import router as script_router
from services.video_service   import router as video_router
from services.edit_service    import router as edit_router
from services.analyze_service import router as analyze_router
from services.test_service    import router as test_router
from services.video_generate_service import router as video_generate_router

# 认证和用户路由
from auth.router import router as auth_router
from user_router import router as user_router
from admin_router import router as admin_router

# 认证相关
app.include_router(auth_router)

# 用户管理
app.include_router(user_router)

# 管理员管理
app.include_router(admin_router)

# API 测试接口
app.include_router(test_router, prefix="/api", tags=["API测试"])

# 前端视频生成接口（兼容格式）
app.include_router(video_generate_router, prefix="/api", tags=["前端视频生成"])

# 步骤1-2：产品管理
app.include_router(product_router, prefix="/api/v1/product",  tags=["产品管理"])

# 步骤2-3：脚本生成（/api/v1/scripts 下含 generate、list、matrix CRUD 等）
app.include_router(script_router, prefix="/api/v1/scripts", tags=["脚本服务"])

# 步骤4：视频生成
app.include_router(video_router,   prefix="/api/v1/videos",   tags=["视频服务"])

# 步骤5：视频编辑去重
app.include_router(edit_router,    prefix="/api/v1/videos",   tags=["视频编辑"])

# 步骤6：数据回流分析
app.include_router(analyze_router, prefix="/api/v1/analyze",  tags=["爆款分析"])

# ──────────────────────────────────────────────
# 静态资源（存储目录对外可访问，方便前端直接读取视频/图片）
# ──────────────────────────────────────────────
import os
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
app.mount("/storage", StaticFiles(directory=settings.STORAGE_DIR), name="storage")


# ──────────────────────────────────────────────
# 应用启动事件
# ──────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    """启动时自动初始化数据库和存储目录"""
    init_db()
    settings.init_storage_dirs()


# ──────────────────────────────────────────────
# 健康检查
# ──────────────────────────────────────────────
@app.get("/", tags=["状态"])
async def root():
    return {
        "service": "AI带货助手 API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", tags=["状态"])
async def health():
    return {"status": "ok"}


# ──────────────────────────────────────────────
# 直接运行入口
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["."]
    )
