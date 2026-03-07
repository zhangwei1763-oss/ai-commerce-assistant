"""
API Key 测试服务
测试豆包/DeepSeek 和 Seedance API 连接
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter()


class TestKeyRequest(BaseModel):
    type: str  # "text" or "video"
    apiKey: str


@router.post("/test-key")
async def test_api_key(request: TestKeyRequest):
    """
    测试 API Key 连接

    接收格式:
    {
        "type": "text" | "video",
        "apiKey": "your-api-key"
    }
    """
    if request.type == "text":
        # 测试豆包/DeepSeek API
        return await test_text_api(request.apiKey)
    elif request.type == "video":
        # 测试 Seedance API
        return await test_video_api(request.apiKey)
    else:
        raise HTTPException(status_code=400, detail="无效的 API 类型")


async def test_text_api(api_key: str) -> dict:
    """测试豆包/DeepSeek API 连接"""
    url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "ep-20241210172426-fbzkg",
        "messages": [
            {"role": "user", "content": "Hi"}
        ],
        "max_tokens": 10,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                return {"ok": True, "message": "连接成功"}
            elif response.status_code == 401:
                return {"ok": False, "message": "API Key 无效或已过期"}
            else:
                text = response.text[:200]
                return {"ok": False, "message": f"连接失败: {text}"}

    except httpx.TimeoutException:
        return {"ok": False, "message": "连接超时，请检查网络后重试"}
    except Exception as e:
        return {"ok": False, "message": f"连接失败: {str(e)}"}


async def test_video_api(api_key: str) -> dict:
    """测试 Seedance API 连接"""
    # 这里使用一个简单的健康检查接口
    # 实际使用时需要根据 Seedance 的实际 API 调整
    try:
        # 由于 Seedance 可能没有专门的测试接口，我们返回一个提示
        return {
            "ok": True,
            "message": "Seedance API Key 已设置（实际视频生成时验证）"
        }
    except Exception as e:
        return {"ok": False, "message": f"连接失败: {str(e)}"}
