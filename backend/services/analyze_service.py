"""
数据回流分析服务
深度拆解爆款视频，提取成功基因，衍生裂变脚本（接口14-15）
"""

import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Product, Script, ViralAnalysis
from api.doubao import doubao_client

router = APIRouter()


class ViralAnalyzeRequest(BaseModel):
    video_url: str
    product_id: str


class ViralDeriveRequest(BaseModel):
    analysis_id: str
    count: int = 10


@router.post("/viral")
async def analyze_viral_video(request: ViralAnalyzeRequest, db: Session = Depends(get_db)):
    """
    【接口14】分析爆款视频，提取黄金基因。
    注意：豆包多模态模型才支持直接分析视频URL，
    若使用纯文本模型则通过URL描述触发推理。
    """
    product = db.query(Product).filter(Product.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    system_prompt = "你是一位专业的短视频爆款分析师，擅长拆解带货视频的成功逻辑。"

    user_prompt = f"""
请深度拆解这个带货视频，提取其爆款基因。

【视频链接】{request.video_url}
【参考产品】{product.product_name}（{product.core_selling_points}）

请从以下维度进行分析：

1. 黄金3秒钩子分析
   - 钩子类型：反常识/痛点/利益/人群呼唤/其他
   - 钩子话术：提取完整文案
   - 分析为什么这个钩子有效

2. 视觉核心拆解
   - 画面风格：亮度/饱和度/色调
   - 镜头语言：产品占比/特写频率/场景切换
   - 字幕样式：字体/颜色/位置

3. 核心痛点转化逻辑
   - 识别了用户的什么痛点
   - 如何展示产品解决痛点
   - 如何打消用户购买顾虑

请直接返回如下 JSON（不要包裹 Markdown 代码块）：
{{
    "hook_analysis": {{
        "type": "痛点+反常识",
        "script": "别买贵的！...",
        "why_works": "..."
    }},
    "visual_analysis": {{
        "brightness": "高亮偏暖",
        "product_ratio": "60%",
        "subtitle_style": "黄底黑字"
    }},
    "conversion_logic": {{
        "pain_point": "没时间去按摩店",
        "solution": "展示使用前后对比",
        "trust_builder": "限时送运费险"
    }}
}}
"""

    try:
        analysis_data = await doubao_client.chat_completion_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.5
        )

        analysis_id = f"analysis_{uuid.uuid4().hex[:8]}"
        record = ViralAnalysis(
            id=analysis_id,
            product_id=product.id,
            video_url=request.video_url,
            hook_analysis=json.dumps(analysis_data.get("hook_analysis", {}), ensure_ascii=False),
            visual_analysis=json.dumps(analysis_data.get("visual_analysis", {}), ensure_ascii=False),
            conversion_logic=json.dumps(analysis_data.get("conversion_logic", {}), ensure_ascii=False),
        )
        db.add(record)
        db.commit()

        return {
            "success": True,
            "analysis_id": analysis_id,
            "analysis": analysis_data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"爆款分析失败: {str(e)}")


@router.post("/viral-derive")
async def derive_viral_scripts(request: ViralDeriveRequest, db: Session = Depends(get_db)):
    """
    【接口15】基于爆款分析结果，裂变生成新脚本。
    保留爆款的核心逻辑（钩子类型、视觉风格、转化逻辑），
    替换为当前产品内容，生成 N 条新脚本。
    """
    analysis = db.query(ViralAnalysis).filter(ViralAnalysis.id == request.analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="分析记录未找到")

    product = db.query(Product).filter(Product.id == analysis.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    # 还原JSON
    hook_analysis    = json.loads(analysis.hook_analysis or "{}")
    visual_analysis  = json.loads(analysis.visual_analysis or "{}")
    conversion_logic = json.loads(analysis.conversion_logic or "{}")

    analysis_summary = f"""
钩子分析：
  - 类型：{hook_analysis.get('type', '')}
  - 话术：{hook_analysis.get('script', '')}
  - 有效原因：{hook_analysis.get('why_works', '')}

视觉风格：
  - 亮度/色调：{visual_analysis.get('brightness', '')}
  - 产品占比：{visual_analysis.get('product_ratio', '')}
  - 字幕样式：{visual_analysis.get('subtitle_style', '')}

转化逻辑：
  - 核心痛点：{conversion_logic.get('pain_point', '')}
  - 解决方案：{conversion_logic.get('solution', '')}
  - 信任建立：{conversion_logic.get('trust_builder', '')}
"""

    user_prompt = f"""
基于以下爆款视频的成功逻辑，为当前产品生成 {request.count} 条裂变脚本。

【爆款视频成功逻辑】
{analysis_summary}

【当前产品信息】
名称：{product.product_name}
卖点：{product.core_selling_points}
痛点：{product.main_pain_points}
价格：{product.price_advantage}
人群：{product.target_audience}

请保持爆款的核心逻辑，但将内容替换为当前产品，生成 {request.count} 条不重样的脚本。
直接返回 JSON 数组，格式：
[
  {{
    "hook_text": "...",
    "product_text": "...",
    "cta_text": "...",
    "visual_prompts": ["[Shot 1] ...", "[Shot 2] ...", "[Shot 3] ..."],
    "hook_type": "..."
  }}
]
"""

    try:
        scripts_data = await doubao_client.chat_completion_json(
            system_prompt="你是一位专业带货短视频编导，擅长基于爆款逻辑进行脚本裂变。",
            user_prompt=user_prompt,
            temperature=0.85
        )

        if isinstance(scripts_data, dict):
            # 有时模型会返回 {"scripts": [...]}
            scripts_data = scripts_data.get("scripts", list(scripts_data.values())[0] if scripts_data else [])

        saved_scripts = []
        for item in (scripts_data if isinstance(scripts_data, list) else []):
            script_id = f"script_v_{uuid.uuid4().hex[:8]}"
            s = Script(
                id=script_id,
                product_id=product.id,
                script_type="viral",
                hook_type=item.get("hook_type", "爆款衍生"),
                audience=product.target_audience,
                hook_text=item.get("hook_text", ""),
                product_text=item.get("product_text", ""),
                cta_text=item.get("cta_text", ""),
                visual_prompts=json.dumps(item.get("visual_prompts", []), ensure_ascii=False),
            )
            db.add(s)
            item["script_id"] = script_id
            saved_scripts.append(item)

        db.commit()

        return {
            "success": True,
            "scripts": saved_scripts,
            "total_count": len(saved_scripts)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"裂变脚本生成失败: {str(e)}")
