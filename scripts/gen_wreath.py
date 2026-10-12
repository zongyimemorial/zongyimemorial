#!/usr/bin/env python3
"""用火山方舟 Doubao Seedream 生成真实感花圈图，并做绿幕抠图。"""
import base64
import json
import os
import sys

import requests
from PIL import Image
from io import BytesIO

OUT = "/workspace/public/assets/wreath-ai.png"

PROMPT = (
    "照片级真实感 3D 渲染，中国传统葬礼大花圈，正面端正视角，完全左右对称。"
    "环形花圈由密集的白色菊花与淡金黄色菊花交替环绕，花材饱满有层次，基环为深绿色藤叶。"
    "花圈下方是古铜色金属立式支架：两条向外斜撑的腿、顶部横托、底部横杆。"
    "花圈正中央悬挂一枚深色圆形牌位，牌面中央是一个立体金色「奠」字。"
    "庄重肃穆，柔和暖色影棚灯光，轻微俯视带来的立体感，材质真实。"
    "主体置于纯色绿幕背景（#00b140）前，背景均匀无杂物，方便后期抠图。"
    "画面中只有这一个花圈，不要挽联飘带，不要人物，不要其他物体。"
)

MODELS = [
    "doubao-seedream-3-0-t2i-250415",
    "doubao-seedream-4-0-250828",
    "doubao-seedream-4-5-251128",
]


def gen(model, api_key):
    url = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    body = {
        "model": model,
        "prompt": PROMPT,
        "size": "1024x1024",
        "n": 1,
        "response_format": "b64_json",
    }
    r = requests.post(url, json=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, timeout=180)
    print(f"[model {model}] HTTP {r.status_code}", file=sys.stderr)
    if r.status_code != 200:
        print(r.text[:500], file=sys.stderr)
        return None
    data = r.json()
    b64 = data["data"][0].get("b64_json")
    if not b64:
        print("no b64_json:", json.dumps(data)[:300], file=sys.stderr)
        return None
    return base64.b64decode(b64)


def remove_greenscreen(img: Image.Image):
    """把接近纯绿幕(0,177,64)的像素设为透明，边缘抗锯齿。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    KEY = (0, 177, 64)
    TOL = 70  # 颜色容差
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # 绿幕判定：绿色通道明显高、且红蓝较低
            if g > 120 and g - r > 40 and g - b > 40:
                diff = abs(r - KEY[0]) + abs(g - KEY[1]) + abs(b - KEY[2])
                if diff < TOL * 3:
                    px[x, y] = (r, g, b, 0)
    return img


def main():
    key = os.environ.get("ARK_API_KEY")
    if not key:
        print("ARK_API_KEY missing", file=sys.stderr)
        sys.exit(2)
    png = None
    for m in MODELS:
        try:
            png = gen(m, key)
        except Exception as e:  # noqa
            print("err", m, e, file=sys.stderr)
            png = None
        if png:
            print("generated with", m, file=sys.stderr)
            break
    if not png:
        print("ALL MODELS FAILED", file=sys.stderr)
        sys.exit(3)
    img = Image.open(BytesIO(png))
    img = remove_greenscreen(img)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG")
    print("saved", OUT, img.size, file=sys.stderr)


if __name__ == "__main__":
    main()
