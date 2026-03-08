"""
前端 AI 生成链路路由
把原本放在 Vite 开发服务器里的脚本生成与爆款分析接口迁到 FastAPI，
便于前端独立部署后继续调用。
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.provider_catalog import (
    normalize_provider,
    resolve_text_endpoint,
    resolve_text_model,
)

router = APIRouter()


class Step1DataPayload(BaseModel):
    productName: str = ""
    coreSellingPoints: str = ""
    painPoints: str = ""
    priceAdvantage: str = ""
    targetAudiences: list[str] = Field(default_factory=list)
    imageDataUrls: list[str] = Field(default_factory=list)


class PromptTemplatePayload(BaseModel):
    id: str = ""
    name: str = ""
    content: str = ""


class ScriptOptionsPayload(BaseModel):
    count: int = 10
    durationSeconds: int = 15
    styles: list[str] = Field(default_factory=list)


class ScriptGenRequest(BaseModel):
    apiKey: str = ""
    provider: str = ""
    apiEndpoint: str = ""
    modelName: str = ""
    options: ScriptOptionsPayload = Field(default_factory=ScriptOptionsPayload)
    promptTemplate: PromptTemplatePayload | None = None
    step1Data: Step1DataPayload = Field(default_factory=Step1DataPayload)


class ViralAnalysisPayload(BaseModel):
    openingShot: str = ""
    visualCore: str = ""
    corePainPoint: str = ""
    whyItWentViral: str = ""
    hookAnalysis: str = ""
    visualAnalysis: list[str] = Field(default_factory=list)
    conversionAnalysis: str = ""
    inferenceNote: str = ""


class ViralAnalyzeRequest(BaseModel):
    apiKey: str = ""
    provider: str = ""
    apiEndpoint: str = ""
    modelName: str = ""
    videoUrl: str = ""
    step1Data: Step1DataPayload = Field(default_factory=Step1DataPayload)


class ViralDeriveRequest(BaseModel):
    apiKey: str = ""
    provider: str = ""
    apiEndpoint: str = ""
    modelName: str = ""
    count: int = 10
    durationSeconds: int = 15
    analysis: ViralAnalysisPayload | None = None
    step1Data: Step1DataPayload = Field(default_factory=Step1DataPayload)


def json_error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"ok": False, "message": message})


def extract_model_output_text(payload: Any) -> str:
    if isinstance(payload, dict):
        choices = payload.get("choices")
        if isinstance(choices, list):
            for item in choices:
                if not isinstance(item, dict):
                    continue
                message = item.get("message")
                if not isinstance(message, dict):
                    continue
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
                if isinstance(content, list):
                    chunks: list[str] = []
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        text = block.get("text")
                        if isinstance(text, str) and text.strip():
                            chunks.append(text.strip())
                    if chunks:
                        return "\n".join(chunks).strip()

    if isinstance(payload, dict):
        output_text = payload.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

    chunks: list[str] = []
    output = payload.get("output") if isinstance(payload, dict) else None
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                text = block.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text)
                block_output_text = block.get("output_text")
                if isinstance(block_output_text, str) and block_output_text.strip():
                    chunks.append(block_output_text)
    return "\n".join(chunks).strip()


def parse_model_json(raw_text: str) -> Any:
    cleaned = raw_text.strip()
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    json_candidate = fenced_match.group(1).strip() if fenced_match else cleaned

    object_start = json_candidate.find("{")
    object_end = json_candidate.rfind("}")
    array_start = json_candidate.find("[")
    array_end = json_candidate.rfind("]")

    parse_target = json_candidate
    if object_start >= 0 and object_end > object_start and (array_start < 0 or object_start < array_start):
        parse_target = json_candidate[object_start : object_end + 1]
    elif array_start >= 0 and array_end > array_start:
        parse_target = json_candidate[array_start : array_end + 1]

    return json.loads(parse_target)


def parse_scripts_from_model_text(raw_text: str, count: int, duration_seconds: int) -> list[dict[str, Any]]:
    parsed = parse_model_json(raw_text)
    if not isinstance(parsed, list):
        return []

    scripts: list[dict[str, Any]] = []
    for index, item in enumerate(parsed[:count]):
        if not isinstance(item, dict):
            continue
        storyboard = item.get("storyboard")
        scripts.append(
            {
                "id": index + 1,
                "title": str(item.get("title") or f"脚本 {index + 1}"),
                "hook": str(item.get("hook") or ""),
                "narration": str(item.get("narration") or ""),
                "storyboard": [str(part) for part in storyboard] if isinstance(storyboard, list) else [],
                "visualPrompt": str(item.get("visualPrompt") or ""),
                "durationSeconds": duration_seconds,
            }
        )
    return scripts


def extract_api_error_message(payload: Any) -> str:
    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            for key in ("message", "detail", "reason"):
                value = error_obj.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        for key in ("message", "detail", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return ""


def should_retry_without_images(message: str) -> bool:
    normalized = message.lower()
    keywords = (
        "image",
        "vision",
        "multimodal",
        "image_url",
        "图片",
        "图像",
        "多模态",
        "content type",
    )
    return any(keyword in normalized for keyword in keywords)


def build_openai_messages(prompt: str, image_data_urls: list[str] | None = None) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": prompt,
        }
    ]

    for image_url in (image_data_urls or [])[:3]:
        if not isinstance(image_url, str) or not image_url.startswith("data:image/"):
            continue
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                },
            }
        )

    return [{"role": "user", "content": content}]


async def post_chat_completion(
    *,
    api_key: str,
    endpoint: str,
    model_name: str,
    prompt: str,
    image_data_urls: list[str] | None = None,
) -> str:
    payload = {
        "model": model_name,
        "messages": build_openai_messages(prompt, image_data_urls),
    }

    timeout = httpx.Timeout(1800.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        try:
            error_body = response.json()
        except Exception:
            error_body = response.text
        message = extract_api_error_message(error_body) or f"模型调用失败，状态码 {response.status_code}"
        raise ValueError(message)

    response_payload = response.json()
    raw_text = extract_model_output_text(response_payload)
    if not raw_text:
        raise ValueError("模型返回为空，请重试")
    return raw_text


async def call_text_model(
    *,
    provider: str,
    api_key: str,
    api_endpoint: str,
    model_name: str,
    prompt: str,
    image_data_urls: list[str] | None = None,
) -> str:
    normalized_provider = normalize_provider(provider, "text")
    resolved_endpoint = resolve_text_endpoint(normalized_provider, api_endpoint)
    resolved_model = resolve_text_model(normalized_provider, model_name)

    if not resolved_endpoint:
        raise ValueError("请先在设置中填写可用的文案 API 端点")
    if not resolved_model:
        raise ValueError("请先在设置中填写文案模型名称")

    try:
        return await post_chat_completion(
            api_key=api_key,
            endpoint=resolved_endpoint,
            model_name=resolved_model,
            prompt=prompt,
            image_data_urls=image_data_urls,
        )
    except ValueError as error:
        if image_data_urls and should_retry_without_images(str(error)):
            return await post_chat_completion(
                api_key=api_key,
                endpoint=resolved_endpoint,
                model_name=resolved_model,
                prompt=prompt,
                image_data_urls=[],
            )
        raise


def get_storyboard_timings(duration_seconds: int) -> dict[str, int]:
    hook_end = 2 if duration_seconds <= 5 else 3
    close_start = (
        duration_seconds - 1
        if duration_seconds <= 5
        else duration_seconds - 3
        if duration_seconds <= 10
        else duration_seconds - 5
    )
    close_start = max(hook_end + 1, close_start)
    if close_start >= duration_seconds:
        close_start = duration_seconds - 1
    return {"hookEnd": hook_end, "closeStart": close_start}


def build_script_prompt(request: ScriptGenRequest) -> tuple[str, int, int]:
    count = max(1, min(20, int(request.options.count or 10)))
    duration_seconds = max(5, min(60, int(request.options.durationSeconds or 15)))
    styles = request.options.styles if request.options.styles else ["口语化"]
    info = request.step1Data
    audience_text = "、".join(info.targetAudiences) or "全人群"
    template_name = request.promptTemplate.name.strip() if request.promptTemplate else ""
    template_content = request.promptTemplate.content.strip() if request.promptTemplate else ""
    timings = get_storyboard_timings(duration_seconds)

    template_rule = ""
    if template_content:
        template_rule = f"""
提示词模板（优先遵循）：
- 模板名称：{template_name or '未命名模板'}
- 模板内容：
{template_content}

执行要求：
- 在不违背产品信息和脚本要求的前提下，严格按上述模板的表达方式、结构和约束输出。
"""

    prompt = f"""
你现在是一位拥有10年操盘经验的抖音/TikTok/视频号金牌带货短视频编导，
深谙人性弱点、下沉市场痛点、短视频算法推流机制以及极速转化爆款逻辑。
你的文案风格口语化、接地气、极具煽动性，能瞬间在竖屏信息流中抓住用户注意力并引导下单，
请基于下列产品信息生成 {count} 条不重样的短视频脚本。
必须输出 JSON 数组，不要输出任何解释文字，不要 Markdown。

产品信息：
- 产品名称：{info.productName}
- 核心卖点：{info.coreSellingPoints}
- 主要痛点：{info.painPoints}
- 价格优势：{info.priceAdvantage}
- 目标人群：{audience_text}
{template_rule}

脚本要求：
- 每条脚本时长：{duration_seconds} 秒
- 文案风格：{'、'.join(styles)}
- 结构固定为三段：0-{timings['hookEnd']}秒钩子、{timings['hookEnd']}-{timings['closeStart']}秒卖点展示、{timings['closeStart']}-{duration_seconds}秒转化收口
- 脚本之间开头钩子与表达方式必须差异化

输出 JSON 数组，每项结构如下：
{{
  "title": "脚本 1：xxx",
  "hook": "一句开头钩子",
  "narration": "完整口播文案",
  "storyboard": ["0-{timings['hookEnd']}秒：...", "{timings['hookEnd']}-{timings['closeStart']}秒：...", "{timings['closeStart']}-{duration_seconds}秒：..."],
  "visualPrompt": "用于视频生成的画面提示词"
}}
"""
    return prompt, count, duration_seconds


def build_step1_summary(info: Step1DataPayload) -> dict[str, str]:
    return {
        "productName": info.productName.strip(),
        "coreSellingPoints": info.coreSellingPoints.strip(),
        "painPoints": info.painPoints.strip(),
        "priceAdvantage": info.priceAdvantage.strip(),
        "audienceText": "、".join(info.targetAudiences) or "全人群",
    }


def normalize_visual_analysis(input_value: Any) -> list[str]:
    if isinstance(input_value, list):
        return [str(item).strip() for item in input_value if str(item).strip()]
    if isinstance(input_value, str):
        return [
            re.sub(r"^[\-•\d.\s]+", "", item).strip()
            for item in re.split(r"\n|；|;", input_value)
            if item and item.strip()
        ]
    return []


def normalize_viral_analysis(input_value: Any) -> dict[str, Any]:
    source = input_value if isinstance(input_value, dict) else {}
    visual_analysis = normalize_visual_analysis(source.get("visualAnalysis"))
    return {
        "openingShot": str(source.get("openingShot") or "").strip(),
        "visualCore": str(source.get("visualCore") or "").strip(),
        "corePainPoint": str(source.get("corePainPoint") or "").strip(),
        "whyItWentViral": str(source.get("whyItWentViral") or "").strip(),
        "hookAnalysis": str(source.get("hookAnalysis") or "").strip(),
        "visualAnalysis": visual_analysis or ["未提取到可用的视觉拆解，请重试。"],
        "conversionAnalysis": str(source.get("conversionAnalysis") or "").strip(),
        "inferenceNote": str(source.get("inferenceNote") or "").strip(),
    }


def build_viral_analysis_prompt(request: ViralAnalyzeRequest) -> str:
    info = build_step1_summary(request.step1Data)
    return f"""
你是一位擅长复盘短视频爆款逻辑的带货增长分析师。现在需要对一个爆款对标视频做复盘。

视频链接：{request.videoUrl.strip()}
当前产品信息：
- 产品名称：{info['productName'] or '未填写'}
- 核心卖点：{info['coreSellingPoints'] or '未填写'}
- 核心痛点：{info['painPoints'] or '未填写'}
- 价格优势：{info['priceAdvantage'] or '未填写'}
- 目标人群：{info['audienceText']}

请严格围绕下面这段任务执行，并把中括号里的内容补全：
“老板，我们之前生成的视频中跑出了超级爆款！现在需复盘并无限放大。爆款视频特征：分镜一(开头)：[填写]视觉核心是：[填写]核心痛点是：[填写]请执行：①拆解为什么会爆？”

输出要求：
1. 如果你能直接利用链接信息分析，就按链接内容输出。
2. 如果你无法直接访问链接真实内容，不要假装看过视频；请基于链接、当前产品信息和带货爆款常见结构进行高可信推断，并在 inferenceNote 中明确说明“以下为推断性拆解”。
3. 只返回 JSON，不要 Markdown，不要额外说明。

请按以下 JSON 结构返回：
{{
  "openingShot": "分镜一(开头)的核心描述",
  "visualCore": "视觉核心是什么",
  "corePainPoint": "视频击中的核心痛点",
  "whyItWentViral": "整体为什么会爆，包含节奏、情绪、转化闭环",
  "hookAnalysis": "对开头钩子的拆解",
  "visualAnalysis": ["视觉拆解要点1", "视觉拆解要点2", "视觉拆解要点3"],
  "conversionAnalysis": "核心痛点如何被放大并完成转化",
  "inferenceNote": "如果是推断，请写明；如果不是推断，返回空字符串"
}}
"""


def build_viral_derive_prompt(request: ViralDeriveRequest) -> tuple[str, int, int]:
    count = max(1, min(20, int(request.count or 10)))
    duration_seconds = max(5, min(60, int(request.durationSeconds or 15)))
    info = build_step1_summary(request.step1Data)
    analysis = normalize_viral_analysis(
        request.analysis.model_dump() if request.analysis else {}
    )
    timings = get_storyboard_timings(duration_seconds)

    prompt = f"""
你是一位擅长“同款逻辑裂变”的带货短视频编导。

先阅读以下爆款复盘：
- 分镜一(开头)：{analysis['openingShot']}
- 视觉核心：{analysis['visualCore']}
- 核心痛点：{analysis['corePainPoint']}
- 为什么会爆：{analysis['whyItWentViral']}
- 黄金3秒钩子分析：{analysis['hookAnalysis']}
- 视觉核心拆解：{'；'.join(analysis['visualAnalysis'])}
- 核心痛点转化逻辑：{analysis['conversionAnalysis']}
{"- 补充说明：" + analysis["inferenceNote"] if analysis["inferenceNote"] else ""}

当前产品信息：
- 产品名称：{info['productName'] or '未填写'}
- 核心卖点：{info['coreSellingPoints'] or '未填写'}
- 主要痛点：{info['painPoints'] or '未填写'}
- 价格优势：{info['priceAdvantage'] or '未填写'}
- 目标人群：{info['audienceText']}

现在执行指令：“按同款逻辑生成{count}条新脚本”

要求：
- 保留上面爆款视频的钩子结构、节奏打法、视觉组织方式和痛点转化逻辑
- 但内容必须替换为当前产品，不能直接复制原视频表述
- 每条脚本时长：{duration_seconds} 秒
- 结构固定为三段：0-{timings['hookEnd']}秒钩子、{timings['hookEnd']}-{timings['closeStart']}秒卖点展示、{timings['closeStart']}-{duration_seconds}秒转化收口
- 输出 {count} 条不重样脚本
- 只返回 JSON 数组，不要 Markdown，不要解释

每项必须使用以下格式：
{{
  "title": "脚本 1：xxx",
  "hook": "一句开头钩子",
  "narration": "完整口播文案",
  "storyboard": ["0-{timings['hookEnd']}秒：...", "{timings['hookEnd']}-{timings['closeStart']}秒：...", "{timings['closeStart']}-{duration_seconds}秒：..."],
  "visualPrompt": "用于视频生成的画面提示词"
}}
"""
    return prompt, count, duration_seconds


@router.post("/generate-scripts")
async def generate_scripts(request: ScriptGenRequest) -> JSONResponse:
    api_key = request.apiKey.strip()
    if not api_key:
        return json_error(400, "缺少文案 API Key")
    if not request.step1Data.productName.strip():
        return json_error(400, "请先在第一步填写产品名称")

    try:
        prompt, count, duration_seconds = build_script_prompt(request)
        raw_text = await call_text_model(
            provider=request.provider,
            api_key=api_key,
            api_endpoint=request.apiEndpoint,
            model_name=request.modelName,
            prompt=prompt,
            image_data_urls=request.step1Data.imageDataUrls,
        )
        scripts = parse_scripts_from_model_text(raw_text, count, duration_seconds)
        if not scripts:
            return json_error(502, "模型返回格式无法解析，请重试")
        return JSONResponse(status_code=200, content={"ok": True, "scripts": scripts})
    except httpx.TimeoutException:
        return json_error(500, "生成超时，请稍后重试")
    except Exception as error:
        return json_error(500, str(error) if str(error) else "服务端异常")


@router.post("/analyze-viral-video")
async def analyze_viral_video(request: ViralAnalyzeRequest) -> JSONResponse:
    api_key = request.apiKey.strip()
    video_url = request.videoUrl.strip()
    if not api_key:
        return json_error(400, "缺少文案 API Key")
    if not video_url:
        return json_error(400, "请先输入爆款视频链接")

    try:
        raw_text = await call_text_model(
            provider=request.provider,
            api_key=api_key,
            api_endpoint=request.apiEndpoint,
            model_name=request.modelName,
            prompt=build_viral_analysis_prompt(request),
            image_data_urls=request.step1Data.imageDataUrls,
        )
        analysis = normalize_viral_analysis(parse_model_json(raw_text))
        return JSONResponse(status_code=200, content={"ok": True, "analysis": analysis})
    except httpx.TimeoutException:
        return json_error(500, "爆款拆解超时，请稍后重试")
    except Exception as error:
        return json_error(500, str(error) if str(error) else "爆款拆解失败")


@router.post("/derive-viral-scripts")
async def derive_viral_scripts(request: ViralDeriveRequest) -> JSONResponse:
    api_key = request.apiKey.strip()
    if not api_key:
        return json_error(400, "缺少文案 API Key")
    if request.analysis is None:
        return json_error(400, "请先完成爆款拆解")

    try:
        prompt, count, duration_seconds = build_viral_derive_prompt(request)
        raw_text = await call_text_model(
            provider=request.provider,
            api_key=api_key,
            api_endpoint=request.apiEndpoint,
            model_name=request.modelName,
            prompt=prompt,
            image_data_urls=request.step1Data.imageDataUrls,
        )
        scripts = parse_scripts_from_model_text(raw_text, count, duration_seconds)
        if not scripts:
            return json_error(502, "新脚本生成失败：模型返回无法解析")
        return JSONResponse(status_code=200, content={"ok": True, "scripts": scripts})
    except httpx.TimeoutException:
        return json_error(500, "新脚本生成超时，请稍后重试")
    except Exception as error:
        return json_error(500, str(error) if str(error) else "新脚本生成失败")
