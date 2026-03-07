"""
Seedance 2.0 API 封装模块
封装 Seedance 视频生成接口，提供异步调用和状态轮询。
"""

import httpx
from typing import Optional, List, Dict
from config import settings


class SeedanceClient:
    """Seedance视频生成API客户端"""

    def __init__(self):
        self.api_key = settings.SEEDANCE_API_KEY
        self.api_url = settings.SEEDANCE_API_URL

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_video(
        self,
        prompt: str,
        style: str = "实景风",
        reference_images: Optional[Dict[str, List[str]]] = None,
        resolution: str = "1080x1920",
        fps: int = 30,
        duration: int = 15,
        aspect_ratio: str = "9:16",
    ) -> dict:
        """
        提交视频生成任务。

        参数:
            prompt: 画面提示词
            style: 视觉风格（实景风/动漫风等）
            reference_images: 参考图片（产品图、人物图）
            resolution: 输出分辨率
            fps: 帧率
            duration: 视频时长（秒）
            aspect_ratio: 画面比例

        返回:
            包含 task_id 的响应字典
        """
        url = f"{self.api_url}/videos/generate"

        payload = {
            "prompt": prompt,
            "style": style,
            "resolution": resolution,
            "fps": fps,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
        }

        if reference_images:
            payload["reference_images"] = reference_images

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self._headers(), json=payload)
            response.raise_for_status()
            return response.json()

    async def check_status(self, task_id: str) -> dict:
        """
        查询视频生成任务的状态。

        参数:
            task_id: Seedance 任务ID

        返回:
            {
                "task_id": "...",
                "status": "pending|processing|completed|failed",
                "progress": 0-100,
                "video_url": "..." (完成时才有)
            }
        """
        url = f"{self.api_url}/videos/status/{task_id}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            return response.json()

    async def download_video(self, video_url: str, save_path: str) -> str:
        """
        下载生成完成的视频到本地。

        参数:
            video_url: 视频在线地址
            save_path: 本地保存路径

        返回:
            本地保存路径
        """
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(video_url)
            response.raise_for_status()

            with open(save_path, "wb") as f:
                f.write(response.content)

        return save_path


# 全局单例
seedance_client = SeedanceClient()
