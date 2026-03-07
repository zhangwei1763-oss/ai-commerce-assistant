"""
脚本生成服务
处理带货脚本批量生成、人群矩阵、钩子衍生等操作（接口3-8）
"""

import uuid
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Product, Script
from api.doubao import doubao_client

router = APIRouter()


class ScriptGenerateRequest(BaseModel):
    product_id: str
    count: int = 10
    duration: int = 15
    styles: List[str] = ["口语化", "煽动性"]


class AudienceGroupParams(BaseModel):
    group_name: str
    pain_points: List[str]
    script_count: int


class MatrixGenerateRequest(BaseModel):
    product_id: str
    audience_groups: List[AudienceGroupParams]


class HookGenerateRequest(BaseModel):
    product_id: str
    hook_types: Dict[str, int]


class ScriptUpdateRequest(BaseModel):
    hook_text: Optional[str] = None
    product_text: Optional[str] = None
    cta_text: Optional[str] = None
    visual_prompts: Optional[List[str]] = None


@router.post("/generate")
async def generate_scripts(request: ScriptGenerateRequest, db: Session = Depends(get_db)):
    """【接口3】批量生成带货脚本"""
    product = db.query(Product).filter(Product.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    word_count = request.duration * 4.5  # 正常语速 4.5字/秒

    system_prompt = "你是一位专业的带货短视频编导。"
    
    user_prompt = f"""
基于以下产品信息，批量生成{request.count}条完全不重样的竖屏带货短视频脚本文案。

【产品信息】
名称：{product.product_name}
卖点：{product.core_selling_points}
痛点：{product.main_pain_points}
价格：{product.price_advantage}
人群：{product.target_audience}

【生成要求】
① 脚本时长：{request.duration}秒三分镜结构
   - 0-3秒：钩子（痛点共鸣/反常识/利益诱惑/人群呼唤）
   - 3-{request.duration-5}秒：产品展示（核心卖点+使用场景）
   - {request.duration-5}-{request.duration}秒：逼单转化（限时/限量/优惠）
   
② 总口播字数：{int(word_count)}字左右

③ 文案风格：{",".join(request.styles)}

④ 每条脚本必须严格按照下面 JSON 格式输出，画面提示词必须用英文描述：

[
  {{
    "hook_type": "痛点共鸣",
    "audience": "打工人",
    "hook_text": "天天低头看手机，脖子酸得像灌了铅？",
    "product_text": "听我的，试试这个智能颈椎按摩仪。TENS脉冲技术直达痛点，加上42度恒温热敷...",
    "cta_text": "今天直播间不要299，只要99，库存不多，赶紧抢！",
    "visual_prompts": [
      "[Shot 1] Close-up of a person rubbing their stiff neck...",
      "[Shot 2] Product shot: sleek white neck massager...",
      "[Shot 3] Person wearing the massager, smiling..."
    ],
    "total_word_count": 68
  }}
]
"""
    try:
        # 要求 JSON 输出
        scripts_data = await doubao_client.chat_completion_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.8
        )
        
        # 兼容可能有外层包装的情况: {"scripts": [...]} 
        if isinstance(scripts_data, dict) and "scripts" in scripts_data:
            scripts_data = scripts_data["scripts"]
        
        if not isinstance(scripts_data, list):
            # 如果大模型返回的不是列表，包装一下
            scripts_data = [scripts_data]

        saved_scripts = []
        for i, item in enumerate(scripts_data):
            script_id = f"script_{uuid.uuid4().hex[:8]}"
            script = Script(
                id=script_id,
                product_id=product.id,
                script_type="normal",
                hook_type=item.get("hook_type", "默认"),
                audience=item.get("audience", product.target_audience),
                hook_text=item.get("hook_text", ""),
                product_text=item.get("product_text", ""),
                cta_text=item.get("cta_text", ""),
                visual_prompts=json.dumps(item.get("visual_prompts", [])),
                total_word_count=item.get("total_word_count", 0),
                styles=",".join(request.styles),
                duration=request.duration
            )
            db.add(script)
            
            # 格式化输出数据
            item["script_id"] = script_id
            saved_scripts.append(item)

        db.commit()

        return {
            "success": True,
            "scripts": saved_scripts,
            "total_count": len(saved_scripts)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"脚本生成失败: {str(e)}")


@router.get("/list")
async def get_script_list(product_id: str, db: Session = Depends(get_db)):
    """【接口4】获取已生成脚本列表"""
    scripts = db.query(Script).filter(Script.product_id == product_id).order_by(Script.created_at.desc()).all()
    
    result = []
    for s in scripts:
        result.append({
            "script_id": s.id,
            "script_type": s.script_type,
            "hook_type": s.hook_type,
            "audience": s.audience,
            "hook_text": s.hook_text,
            "product_text": s.product_text,
            "cta_text": s.cta_text,
            "visual_prompts": json.loads(s.visual_prompts) if s.visual_prompts else [],
            "total_word_count": s.total_word_count,
            "created_at": s.created_at
        })

    return {"success": True, "scripts": result}


@router.put("/{script_id}")
async def update_script(script_id: str, request: ScriptUpdateRequest, db: Session = Depends(get_db)):
    """【接口5】更新脚本内容"""
    script = db.query(Script).filter(Script.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="脚本未找到")

    if request.hook_text is not None:
        script.hook_text = request.hook_text
    if request.product_text is not None:
        script.product_text = request.product_text
    if request.cta_text is not None:
        script.cta_text = request.cta_text
    if request.visual_prompts is not None:
        script.visual_prompts = json.dumps(request.visual_prompts)

    db.commit()
    return {"success": True, "message": "脚本已更新"}


@router.delete("/{script_id}")
async def delete_script(script_id: str, db: Session = Depends(get_db)):
    """【接口6】删除脚本"""
    script = db.query(Script).filter(Script.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="脚本未找到")
    
    db.delete(script)
    db.commit()
    return {"success": True, "message": "脚本已删除"}


@router.post("/matrix")
async def generate_matrix_scripts(request: MatrixGenerateRequest, db: Session = Depends(get_db)):
    """【接口7】生成人群矩阵脚本"""
    # 此处简化：循环调用豆包或构建批量 prompt，此处为演示构建
    product = db.query(Product).filter(Product.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    matrix_results = {}
    
    # 在实际应用中，这里可以通过 asyncio.gather 并发调用豆包提升速度
    # 示例简化为一个一个调用
    
    for group in request.audience_groups:
        system_prompt = "你是一位精准面向下沉市场的带货短视频编导。"
        user_prompt = f"""
针对产品：{product.product_name} (卖点：{product.core_selling_points})
目标人群：【{group.group_name}】
核心痛点：{",".join(group.pain_points)}

请为该人群生成 {group.script_count} 条带货脚本。请返回纯JSON数组：
[
    {{"hook_text": "...", "product_text": "...", "cta_text": "...", "pain_point": "省时"}}
]
"""
        try:
            scripts_data = await doubao_client.chat_completion_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.8
            )
            
            # 持久化到数据库
            group_scripts = []
            for item in (scripts_data if isinstance(scripts_data, list) else []):
                script_id = f"script_m_{uuid.uuid4().hex[:8]}"
                s = Script(
                    id=script_id,
                    product_id=product.id,
                    script_type="matrix",
                    audience=group.group_name,
                    hook_type=item.get("pain_point", "痛点"),
                    hook_text=item.get("hook_text", ""),
                    product_text=item.get("product_text", ""),
                    cta_text=item.get("cta_text", ""),
                )
                db.add(s)
                
                item["script_id"] = script_id
                group_scripts.append(item)
                
            matrix_results[group.group_name] = group_scripts
            
        except Exception as e:
            matrix_results[group.group_name] = {"error": str(e)}

    db.commit()
    return {"success": True, "matrix_scripts": matrix_results}


@router.post("/hooks/generate")
async def generate_hooks(request: HookGenerateRequest, db: Session = Depends(get_db)):
    """【接口8】生成黄金3秒钩子"""
    product = db.query(Product).filter(Product.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    req_str = "\n".join([f"- {k}: {v}个" for k, v in request.hook_types.items()])

    user_prompt = f"""
为产品【{product.product_name}】生成黄金3秒开头钩子。

【产品信息】
名称：{product.product_name}
卖点：{product.core_selling_points}
痛点：{product.main_pain_points}

【需要生成的钩子分类和数量】
{req_str}

【钩子类型说明】
1. 反常识钩子：打破用户认知，制造悬念
2. 痛点钩子：直接戳中用户痛点
3. 利益钩子：强调优惠和福利
4. 人群呼唤钩子：直接召唤特定人群

请直接返回JSON格式，结构如下：
{{
    "反常识": ["钩子1", "钩子2"...],
    "痛点": ["钩子1", "钩子2"...]
}}
"""
    try:
        hooks_data = await doubao_client.chat_completion_json(
            system_prompt="你是一个爆款文案专家。",
            user_prompt=user_prompt,
            temperature=0.9
        )
        return {"success": True, "hooks": hooks_data}
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"钩子生成失败: {str(e)}")
