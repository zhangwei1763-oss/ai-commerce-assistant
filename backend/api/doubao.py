"""
豆包API封装模块
封装字节跳动豆包大模型的 OpenAI 兼容接口，提供异步调用方法。
"""

import json
import httpx
from config import settings


class DoubaoClient:
    """豆包API客户端"""

    def __init__(self):
        self.api_key = settings.DOUBAO_API_KEY
        self.api_url = settings.DOUBAO_API_URL
        self.model = settings.DOUBAO_MODEL

    async def chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.8,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> str:
        """
        调用豆包 Chat Completion 接口。

        参数:
            system_prompt: 系统提示词（角色设定）
            user_prompt: 用户提示词（具体任务）
            temperature: 创造性参数，越高越有创意
            max_tokens: 最大输出 token 数
            json_mode: 是否要求返回 JSON 格式

        返回:
            AI 生成的文本内容
        """
        url = f"{self.api_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        # JSON模式：强制输出合法JSON
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        return content

    async def chat_completion_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.8,
    ) -> dict:
        """
        调用豆包并解析返回的JSON。
        如果返回被 markdown 代码块包裹，会自动提取。
        """
        raw = await self.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            json_mode=True,
        )

        # 尝试直接解析
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        # 手动提取JSON块（处理 ```json ... ``` 包裹的情况）
        raw_stripped = raw.strip()
        if raw_stripped.startswith("```"):
            lines = raw_stripped.split("\n")
            json_lines = []
            inside = False
            for line in lines:
                if line.strip().startswith("```") and not inside:
                    inside = True
                    continue
                elif line.strip() == "```" and inside:
                    break
                elif inside:
                    json_lines.append(line)
            raw_stripped = "\n".join(json_lines)

        return json.loads(raw_stripped)


# 全局单例
doubao_client = DoubaoClient()
