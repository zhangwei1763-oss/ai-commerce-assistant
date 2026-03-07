"""
产品信息管理服务
处理产品保存与AI确认（接口1-2）
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Product
from api.doubao import doubao_client
from utils.file_handler import safe_filename

router = APIRouter()


class ProductSaveRequest(BaseModel):
    product_name: str
    core_selling_points: str
    main_pain_points: str
    price_advantage: str
    target_audience: str
    product_images: list[str] = []


class ProductConfirmRequest(BaseModel):
    product_id: str


@router.post("/save")
async def save_product(request: ProductSaveRequest, db: Session = Depends(get_db)):
    """
    【接口1】保存产品信息
    """
    # 生成唯一产品ID：prod_YYYYMMDD_原名
    date_str = datetime.now().strftime("%Y%m%d")
    clean_name = safe_filename(request.product_name)
    import uuid
    short_uuid = uuid.uuid4().hex[:6]
    product_id = f"prod_{date_str}_{clean_name}_{short_uuid}"

    # 保存图片并替换为本地路径 (为了简单起见，这里假设已经是URL或者后续处理)
    # 实际项目中这里需要将Base64图片保存到本地，并保留路径
    
    product = Product(
        id=product_id,
        product_name=request.product_name,
        core_selling_points=request.core_selling_points,
        main_pain_points=request.main_pain_points,
        price_advantage=request.price_advantage,
        target_audience=request.target_audience,
        product_images=json.dumps(request.product_images),
    )
    
    db.add(product)
    db.commit()
    db.refresh(product)

    return {
        "success": True,
        "product_id": product.id,
        "message": "产品信息已保存"
    }


@router.post("/confirm")
async def confirm_product(request: ProductConfirmRequest, db: Session = Depends(get_db)):
    """
    【接口2】确认产品信息（调用豆包）
    """
    product = db.query(Product).filter(Product.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    system_prompt = """你是一位拥有10年操盘经验的抖音/TikTok/视频号金牌带货短视频编导，
深谙人性弱点、下沉市场痛点、短视频算法推流机制以及极速转化爆款逻辑。"""

    user_prompt = f"""
【产品名称】：{product.product_name}
【核心卖点】：{product.core_selling_points}
【主要痛点】：{product.main_pain_points}
【价格优势】：{product.price_advantage}
【目标人群】：{product.target_audience}

阅读完毕后，只需要回复我："老板，我已了解产品，随时可以开始写爆款带货短视频脚本！"
"""

    try:
        # 调用豆包API
        ai_response = await doubao_client.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.3
        )
        
        # 更新确认状态
        product.confirmed = True
        db.commit()

        return {
            "success": True,
            "ai_response": ai_response.strip(),
            "confirmed": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"豆包API调用失败: {str(e)}")
