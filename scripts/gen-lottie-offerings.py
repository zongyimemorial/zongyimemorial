#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成「宗忆堂」墨金风格祭品 Lottie 微动图。
输出：public/assets/lottie/<archetype>.json
调色板取自 tailwind brand(墨褐) / accent(香槟金)。
所有动画 200x200 画布、30fps、3s 无缝循环、克制微动。
仅使用 Lottie 基础图元（椭圆/矩形/星形/多边形/直线路径），保证渲染稳健。
"""
import json, os

# ---------- 调色板 ----------
INK     = "#3a2f18"  # brand-800 墨褐（主结构线）
INK_D   = "#241d0f"  # brand-900 深墨
INK_M   = "#63512f"  # brand-600 中墨
GOLD    = "#e8c56d"  # accent-300 香槟金（高光）
GOLD_D  = "#d4af37"  # accent-400 深金
GOLD_L  = "#f0e0b0"  # accent-200 浅金
CREAM   = "#f2ede4"  # brand-100 蜡烛奶白
PAPER   = "#faf8f4"  # brand-50
GREEN   = "#5b9e6a"  # 免费标点缀
RED     = "#b4543a"  # 酒/朱印

FR = 30
OP = 90  # 3s

# ---------- 基础工具 ----------
def hx(c):
    c = c.lstrip("#")
    return [int(c[0:2],16)/255, int(c[2:4],16)/255, int(c[4:6],16)/255, 1.0]

def c(v):  # 静态属性
    return {"a": 0, "k": v}

def kf(pts):  # 关键帧动画；pts=[(frame, value), ...]
    k = []
    for i, (f, v) in enumerate(pts):
        d = {"t": f, "s": v if isinstance(v, list) else [v]}
        if i < len(pts) - 1:
            d["i"] = {"x": [0.5], "y": [0.5]}
            d["o"] = {"x": [0.5], "y": [0.5]}
        k.append(d)
    return {"a": 1, "k": k}

def mk_fill(color, op=100):
    return {"ty": "fl", "c": c(hx(color)), "o": c(op), "r": 1, "bm": 0}

def mk_stroke(color, w=3, op=100):
    return {"ty": "st", "c": c(hx(color)), "o": c(op), "w": c(w), "lc": 2, "lj": 2, "ml": 4, "bm": 0}

def _wrap(shapes, fill, stroke):
    it = list(shapes)
    if fill is not None:
        it.append(mk_fill(*fill) if isinstance(fill, tuple) else mk_fill(fill))
    if stroke is not None:
        if isinstance(stroke, tuple):
            it.append(mk_stroke(stroke[0], stroke[1]))
        else:
            it.append(mk_stroke(stroke))
    it.append({"ty": "tr", "p": c([0, 0]), "a": c([0, 0]), "s": c([100, 100]), "r": c(0), "o": c(100)})
    return {"ty": "gr", "it": it}

def ellipse(cx, cy, w, h, fill=None, stroke=None):
    return _wrap([{"ty": "el", "p": c([cx, cy]), "s": c([w, h]), "d": 1}], fill, stroke)

def rect(cx, cy, w, h, r=0, fill=None, stroke=None):
    return _wrap([{"ty": "rc", "p": c([cx, cy]), "s": c([w, h]), "r": c(r)}], fill, stroke)

def star(cx, cy, pts, outer, inner=0, fill=None, stroke=None):
    """
    星形 / 正多边形。

    ⚠️ `sy` **不再由调用方传**，一律由 `inner` 推导 —— 这两个字段必须成套自洽：

      · `sy` 是 lottie 的**图形种类**：1 = 星形（走 `convertStarToPath`，用外径 `or`
        **加**内径 `ir`）；2 = 多边形（走 `convertPolygonToPath`，**只用外径**）。
      · 曾经把 `sy` 当"形状意图"交给调用方，而那套约定恰好和 lottie 相反 ——
        真星形传 `sy=2` 却又带 `ir`，等于"声明我是多边形、却塞了内径"。
        这种自相矛盾的 `sr`，lottie-web 5.13 **不报错、不告警**，但整层渲染管线
        静默中止，最终产出一个**空的 `<g>`** —— 页面表现就是"动图区域一片空白"，
        而 JSON 看上去完全正常（配色、透明度动画都在），极难定位。

    实测受害文件 7 个（全部用 star() 生成）：star / moon / music / service / cloud /
    firework / decor；用 ellipse/rect 的 candle、flower 等一直正常。

    正确产出（两者一致，几何也正是调用方想要的）：
      inner > 0 → 星形：sy=1，带 `ir`/`is`
      inner = 0 → 多边形：sy=2，**不带** `ir`/`is`
    """
    common = {"ty": "sr", "pt": c(pts), "p": c([cx, cy]), "r": c(0),
              "or": c(outer), "os": c(0), "d": 1}
    if inner > 0:
        return _wrap([{**common, "sy": 1, "ir": c(inner), "is": c(0)}], fill, stroke)
    return _wrap([{**common, "sy": 2}], fill, stroke)

def poly(verts, fill=None, stroke=None, closed=True):
    n = len(verts)
    z = [[0, 0] for _ in range(n)]
    return _wrap([{"ty": "sh", "ks": c({"c": closed, "v": verts, "i": z, "o": z})}], fill, stroke)

def line(x1, y1, x2, y2, color, w=3, op=100):
    return _wrap([{"ty": "sh", "ks": c({"c": False, "v": [[x1, y1], [x2, y2]], "i": [[0, 0], [0, 0]], "o": [[0, 0], [0, 0]]})}],
                 None, (color, w, op))

# ---------- 图层 ----------
_IND = [0]
STATIC = {"o": c(100), "r": c(0), "p": c([0, 0, 0]), "a": c([0, 0, 0]), "s": c([100, 100, 100])}

def L(name, shapes, anim=None):
    _IND[0] += 1
    ks = anim if anim else STATIC
    return {"ddd": 0, "ind": _IND[0], "ty": 4, "nm": name, "sr": 1, "ks": ks,
            "ao": 0, "shapes": shapes, "ip": 0, "op": OP, "st": 0, "bm": 0}

def center_ks(over=None):
    ks = {"o": c(100), "r": c(0), "p": c([100, 100, 0]), "a": c([100, 100, 0]), "s": c([100, 100, 100])}
    if over:
        ks.update(over)
    return ks

# 微动预设
def sway(amp=6):
    return kf([(0, [100 - amp, 100, 0]), (OP // 2, [100 + amp, 100, 0]), (OP, [100 - amp, 100, 0])])

def spin(amp=8):
    return kf([(0, -amp), (OP // 2, amp), (OP, -amp)])

def breathe(maxs=106):
    return kf([(0, [100, 100, 100]), (OP // 2, [maxs, maxs, 100]), (OP, [100, 100, 100])])

def pulse(mino=80):
    return kf([(0, mino), (OP // 2, 100), (OP, mino)])

# ---------- archetype 构建 ----------
def arch_candle():
    glow = L("glow", [ellipse(100, 100, 150, 150, (GOLD, 7))], center_ks({"o": pulse(55)}))
    body = L("body", [
        rect(100, 122, 46, 78, 10, CREAM, INK),
        ellipse(100, 84, 46, 14, CREAM, INK),
        rect(100, 74, 4, 14, 0, INK),
    ])
    flame = L("flame", [
        poly([(100, 46), (112, 76), (100, 88), (88, 76)], GOLD),
        poly([(100, 58), (106, 78), (100, 86), (94, 78)], GOLD_L),
    ], center_ks({"s": kf([(0, [100, 94, 100]), (15, [106, 112, 100]), (30, [96, 100, 100]),
                           (45, [104, 108, 100]), (60, [100, 96, 100]), (OP, [100, 94, 100])]),
                   "o": pulse(86)}))
    return [glow, body, flame]

def arch_incense():
    stick = L("stick", [rect(100, 130, 6, 90, 3, INK_M), ellipse(100, 84, 12, 12, INK_D)])
    smoke = []
    for i, (cx, base) in enumerate([(100, 70), (92, 60), (108, 56)]):
        smoke.append(L(f"smoke{i}", [
            ellipse(cx, base, 16, 30, (GOLD_L, 0)),
        ], center_ks({"o": kf([(0, 0), (20, 55), (55, 0)]),
                      "p": kf([(0, [100, 100, 0]), (OP // 2, [100, 70, 0]), (OP, [100, 100, 0])]),
                      "s": kf([(0, [40, 40, 100]), (OP // 2, [110, 130, 100]), (OP, [40, 40, 100])])})))
    return [stick] + smoke

def arch_flower():
    petals = []
    for i in range(6):
        ang = i * 60
        import math
        cx = 100 + 34 * math.cos(math.radians(ang - 90))
        cy = 100 + 34 * math.sin(math.radians(ang - 90))
        petals.append(ellipse(cx, cy, 30, 46, (GOLD, 92), INK))
    bloom = L("bloom", petals, center_ks({"r": kf([(0, -12), (OP // 2, 12), (OP, -12)]),
                                         "s": breathe(105)}))
    center = L("center", [ellipse(100, 100, 34, 34, INK_D), ellipse(100, 100, 18, 18, GOLD)])
    return [bloom, center]

def arch_wreath():
    ring = L("ring", [ellipse(100, 100, 150, 150, None, (GOLD, 12, 100)),
                      ellipse(100, 100, 124, 124, None, (INK_M, 5, 100))],
             center_ks({"r": kf([(0, -6), (OP // 2, 6), (OP, -6)])}))
    leaves = []
    import math
    for i in range(12):
        ang = i * 30
        cx = 100 + 64 * math.cos(math.radians(ang))
        cy = 100 + 64 * math.sin(math.radians(ang))
        leaves.append(ellipse(cx, cy, 16, 26, (GOLD, 80), INK))
    rib = L("ribbon", [poly([(100, 150), (86, 192), (100, 178), (114, 192)], (GOLD_D, 95), INK),
                       poly([(100, 150), (100, 196)], None, (INK, 3, 60))])
    return [ring, L("leaves", leaves), rib]

def arch_lantern():
    glow = L("glow", [ellipse(100, 100, 150, 150, (GOLD, 7))], center_ks({"o": pulse(55)}))
    cord = L("cord", [line(100, 30, 100, 58, INK, 3)])
    body = L("body", [
        rect(100, 110, 12, 10, 2, INK_D),
        ellipse(100, 112, 78, 84, GOLD, INK),
        ellipse(100, 112, 50, 60, (GOLD_L, 0)),
        rect(100, 152, 12, 10, 2, INK_D),
        line(100, 70, 100, 154, INK_M, 2),
    ], center_ks({"r": sway(7)}))
    return [glow, cord, body]

def arch_bell():
    bell = L("bell", [
        poly([(78, 140), (122, 140), (118, 96), (108, 80), (92, 80), (82, 96)], (GOLD, 95), INK),
        ellipse(100, 78, 22, 14, (GOLD, 95), INK),
        rect(100, 70, 8, 10, 2, INK_D),
        ellipse(100, 144, 12, 8, INK_D),
    ], center_ks({"r": kf([(0, -7), (OP // 2, 7), (OP, -7)])}))
    rings = []
    for i in range(2):
        rings.append(L(f"ring{i}", [ellipse(100, 110, 40 + i * 30, 40 + i * 30, None, (GOLD, 2, 70))],
                       center_ks({"o": kf([(0, 0), (10 + i * 8, 70), (40 + i * 8, 0)]),
                                  "s": kf([(0, [60, 60, 100]), (40, [130, 130, 100]), (40, [60, 60, 100])])})))
    return [bell] + rings

def arch_dove():
    body = L("body", [
        ellipse(100, 110, 46, 34, (GOLD, 95), INK),
        ellipse(126, 100, 18, 18, (GOLD, 95), INK),   # head
        poly([(140, 100), (152, 96), (142, 106)], GOLD_D),  # beak
        ellipse(96, 132, 26, 16, INK_D),              # tail
    ], center_ks({"p": kf([(0, [100, 104, 0]), (OP // 2, [100, 96, 0]), (OP, [100, 104, 0])])}))
    wing = L("wing", [poly([(92, 102), (70, 84), (78, 108), (60, 110)], (GOLD_L, 95), INK)],
             center_ks({"r": kf([(0, -10), (OP // 2, 22), (OP, -10)])}))
    return [wing, body]

def arch_willow():
    trunk = L("trunk", [line(100, 40, 100, 96, INK_M, 5)])
    branches = []
    for dx in (-46, -22, 0, 22, 46):
        branches.append(L(f"b{dx}", [
            poly([(100, 52), (100 + dx, 150)], None, (INK_M, 3, 80)),
            ellipse(100 + dx, 150, 8, 14, (GOLD, 80)),
        ], center_ks({"r": kf([(0, -4), (OP // 2, 4), (OP, -4)])})))
    return [trunk] + branches

def arch_food():
    plate = L("plate", [ellipse(100, 124, 110, 40, (GOLD_L, 0), INK),
                        ellipse(100, 120, 86, 28, CREAM, INK)])
    items = L("items", [
        ellipse(82, 112, 24, 18, (GOLD, 95), INK),
        ellipse(118, 112, 24, 18, (GOLD, 95), INK),
        ellipse(100, 106, 22, 18, INK_D),
        ellipse(100, 124, 14, 10, GOLD_D),
    ], center_ks({"s": breathe(103)}))
    return [plate, items]

def arch_wine():
    cup = L("cup", [
        poly([(76, 86), (124, 86), (116, 150), (84, 150)], (GOLD, 92), INK),
        ellipse(100, 86, 48, 14, (GOLD_L, 0), INK),
        poly([(84, 150), (116, 150), (110, 162), (90, 162)], INK_D),
    ])
    liquid = L("liquid", [ellipse(100, 104, 38, 22, (GOLD_D, 95))],
               center_ks({"o": pulse(80)}))
    return [cup, liquid]

def arch_scripture():
    scroll = L("scroll", [
        rect(60, 100, 14, 80, 7, INK_D),
        rect(140, 100, 14, 80, 7, INK_D),
        rect(100, 100, 80, 70, 4, (GOLD_L, 0), INK),
        line(82, 88, 118, 88, INK_M, 2),
        line(82, 100, 118, 100, INK_M, 2),
        line(82, 112, 118, 112, INK_M, 2),
    ], center_ks({"s": kf([(0, [70, 100, 100]), (OP // 2, [108, 100, 100]), (OP, [70, 100, 100])])}))
    return [scroll]

def arch_tea():
    cup = L("cup", [ellipse(100, 122, 64, 44, (GOLD, 92), INK),
                    ellipse(100, 116, 44, 26, INK_D),
                    poly([(64, 116), (52, 150), (84, 150), (72, 116)], (GOLD, 92), INK)])
    steam = []
    for i, dx in enumerate((-12, 12)):
        steam.append(L(f"st{i}", [ellipse(100 + dx, 96, 10, 22, (GOLD_L, 0))],
                       center_ks({"o": kf([(0, 0), (15 + i * 10, 70), (45 + i * 10, 0)]),
                                  "p": kf([(0, [100, 96, 0]), (OP // 2, [100, 70, 0]), (OP, [100, 96, 0])]),
                                  "s": kf([(0, [50, 50, 100]), (OP // 2, [120, 150, 100]), (OP, [50, 50, 100])])})))
    return [cup] + steam

def arch_moon():
    glow = L("glow", [ellipse(100, 100, 150, 150, (GOLD, 6))], center_ks({"o": pulse(50)}))
    moon = L("moon", [
        ellipse(100, 100, 96, 96, GOLD),
        ellipse(128, 84, 84, 84, PAPER),
    ], center_ks({"r": kf([(0, -8), (OP // 2, 8), (OP, -8)]), "s": breathe(104)}))
    twinkle = L("star", [star(150, 56, 5, 12, 5, GOLD_D)],
             center_ks({"o": pulse(40), "s": breathe(120)}))
    return [glow, moon, twinkle]

def arch_star():
    return [L("star", [star(100, 100, 5, 78, 32, GOLD, INK)],
              center_ks({"r": spin(18), "s": breathe(108)}))]

def arch_music():
    n1 = L("n1", [ellipse(78, 132, 30, 22, INK_D),
                  rect(92, 80, 6, 56, 0, INK_D),
                  ellipse(118, 124, 30, 22, INK_D),
                  rect(132, 70, 6, 56, 0, INK_D),
                  rect(92, 70, 46, 12, 3, INK_D)],
         center_ks({"p": kf([(0, [100, 100, 0]), (OP // 2, [100, 94, 0]), (OP, [100, 100, 0])])}))
    spark = L("spark", [star(150, 60, 4, 12, 5, GOLD)],
              center_ks({"o": pulse(50), "s": breathe(120)}))
    return [n1, spark]

def arch_prayer():
    hands = L("hands", [
        poly([(64, 150), (88, 96), (100, 84), (112, 96), (136, 150)], (GOLD, 92), INK),
        poly([(100, 84), (100, 150)], None, (INK_M, 2, 60)),
    ], center_ks({"s": kf([(0, [100, 100, 100]), (OP // 2, [104, 96, 100]), (OP, [100, 100, 100])])}))
    lotus = L("lotus", [ellipse(100, 70, 22, 30, GOLD_L, INK)])
    return [hands, lotus]

def arch_tree():
    tree = L("tree", [
        rect(100, 158, 10, 30, 2, INK_M),
        star(100, 96, 3, 56, 0, (GOLD, 92), INK),   # 三角松（inner=0 → 多边形）
        star(100, 122, 3, 46, 0, (GOLD, 92), INK),
        star(100, 144, 3, 36, 0, (GOLD, 92), INK),
    ], center_ks({"r": kf([(0, -3), (OP // 2, 3), (OP, -3)])}))
    lights = []
    import math
    for i in range(5):
        ang = i * 72
        lx = 100 + 30 * math.cos(math.radians(ang))
        ly = 116 + 22 * math.sin(math.radians(ang))
        lights.append(L(f"l{i}", [ellipse(lx, ly, 8, 8, GOLD_D)],
                        center_ks({"o": kf([(0, 100), (15 + i * 8, 40), (30 + i * 8, 100)])})))
    return [tree] + lights

def arch_lotus():
    petals = []
    import math
    for i in range(5):
        ang = i * 72
        cx = 100 + 22 * math.cos(math.radians(ang - 90))
        cy = 100 + 22 * math.sin(math.radians(ang - 90))
        petals.append(ellipse(cx, cy, 22, 40, (GOLD_L, 0), INK))
    base = L("base", [ellipse(100, 100, 30, 30, GOLD, INK)])
    return [L("petals", petals, center_ks({"s": kf([(0, [80, 80, 100]), (OP // 2, [112, 112, 100]), (OP, [80, 80, 100])]),
                                          "r": kf([(0, -10), (OP // 2, 10), (OP, -10)])})), base]

def arch_bow():
    fig = L("fig", [
        ellipse(100, 74, 26, 26, INK_D),               # 头
        poly([(100, 96), (130, 150), (108, 150), (100, 120), (92, 150), (70, 150)], (GOLD, 92), INK),
    ], center_ks({"r": kf([(0, -4), (OP // 2, 6), (OP, -4)])}))
    return [fig]

def arch_chime():
    top = L("top", [rect(100, 56, 70, 12, 4, INK_D), line(100, 50, 100, 40, INK_M, 3)])
    tubes = []
    for i, dx in enumerate((-26, -9, 9, 26)):
        tubes.append(L(f"t{i}", [rect(100 + dx, 116, 8, 60, 4, (GOLD, 92), INK),
                                 ellipse(100 + dx, 148, 12, 8, INK_D)],
                        center_ks({"r": kf([(0, -3 - i), (OP // 2, 3 + i), (OP, -3 - i)])})))
    return [top] + tubes

def arch_clean():
    broom = L("broom", [
        rect(116, 80, 8, 70, 3, INK_M),
        poly([(86, 150), (100, 118), (114, 150), (100, 162)], (GOLD, 92), INK),
        line(90, 150, 110, 150, INK_M, 2),
    ], center_ks({"r": kf([(0, -12), (OP // 2, 12), (OP, -12)]),
                  "p": kf([(0, [100, 100, 0]), (OP // 2, [110, 100, 0]), (OP, [100, 100, 0])])}))
    return [broom]

def arch_firework():
    core = L("core", [star(100, 100, 5, 14, 6, GOLD)])
    rays = []
    import math
    for i in range(8):
        ang = i * 45
        x1 = 100 + 26 * math.cos(math.radians(ang))
        y1 = 100 + 26 * math.sin(math.radians(ang))
        x2 = 100 + 72 * math.cos(math.radians(ang))
        y2 = 100 + 72 * math.sin(math.radians(ang))
        rays.append(L(f"r{i}", [line(x1, y1, x2, y2, GOLD_D, 3)],
                      center_ks({"o": kf([(0, 0), (10 + i, 95), (40 + i, 0)]),
                                 "s": kf([(0, [40, 40, 100]), (40, [120, 120, 100]), (40, [40, 40, 100])])})))
    return [core] + rays

def arch_kite():
    sky = L("tail", [poly([(100, 110), (100, 180)], None, (INK_M, 2, 60)),
                      ellipse(100, 150, 8, 8, GOLD), ellipse(100, 168, 8, 8, GOLD_D)],
            center_ks({"r": kf([(0, -5), (OP // 2, 5), (OP, -5)])}))
    kite = L("kite", [
        star(100, 80, 4, 52, 0, (GOLD, 92), INK),
        poly([(100, 28), (100, 132)], None, (INK_M, 2, 70)),
        poly([(48, 80), (152, 80)], None, (INK_M, 2, 70)),
    ], center_ks({"r": kf([(0, -8), (OP // 2, 8), (OP, -8)]),
                  "p": kf([(0, [100, 96, 0]), (OP // 2, [100, 88, 0]), (OP, [100, 96, 0])])}))
    return [sky, kite]

def arch_letter():
    env = L("env", [
        rect(100, 108, 120, 80, 8, (GOLD_L, 0), INK),
        poly([(40, 80), (100, 124), (160, 80)], None, (INK_M, 3, 90)),
    ])
    flap = L("flap", [poly([(40, 80), (100, 124), (160, 80), (160, 80)], GOLD, INK)],
             center_ks({"r": kf([(0, -28), (OP // 2, 0), (OP, -28)])}))
    dot = L("dot", [ellipse(100, 150, 8, 8, GOLD_D)],
            center_ks({"o": kf([(0, 0), (30, 80), (OP, 0)])}))
    return [env, flap, dot]

def arch_message():
    bubble = L("bubble", [
        rect(100, 96, 120, 78, 18, (GOLD_L, 0), INK),
        poly([(70, 132), (70, 158), (96, 132)], (GOLD_L, 0), INK),
    ], center_ks({"s": breathe(103)}))
    dots = L("dots", [ellipse(78, 96, 12, 12, INK_D), ellipse(100, 96, 12, 12, INK_D), ellipse(122, 96, 12, 12, INK_D)])
    return [bubble, dots]

def arch_book():
    book = L("book", [
        poly([(44, 70), (100, 60), (100, 140), (44, 150)], (GOLD_L, 0), INK),
        poly([(156, 70), (100, 60), (100, 140), (156, 150)], (GOLD_L, 0), INK),
        line(100, 60, 100, 140, INK, 3),
        line(60, 84, 92, 78, INK_M, 2),
        line(108, 78, 140, 84, INK_M, 2),
        line(60, 104, 92, 98, INK_M, 2),
        line(108, 98, 140, 104, INK_M, 2),
    ], center_ks({"r": kf([(0, -4), (OP // 2, 4), (OP, -4)])}))
    return [book]

def arch_fruit():
    bowl = L("bowl", [poly([(56, 116), (144, 116), (128, 150), (72, 150)], (GOLD, 92), INK),
                      ellipse(100, 116, 88, 18, (GOLD_L, 0), INK)])
    fruits = L("fruits", [
        ellipse(82, 104, 26, 24, (GOLD, 95), INK),
        ellipse(118, 104, 26, 24, (GOLD, 95), INK),
        ellipse(100, 92, 26, 24, GOLD_D, INK),
    ])
    return [bowl, fruits]

def arch_rice():
    bowl = L("bowl", [poly([(56, 116), (144, 116), (128, 150), (72, 150)], (GOLD, 92), INK),
                      ellipse(100, 116, 88, 18, (GOLD_L, 0), INK)])
    rice = L("rice", [ellipse(100, 100, 70, 34, CREAM, INK),
                      ellipse(88, 96, 8, 8, INK_M), ellipse(104, 94, 8, 8, INK_M), ellipse(116, 100, 8, 8, INK_M)],
           center_ks({"s": breathe(102)}))
    steam = L("steam", [ellipse(100, 78, 12, 24, (GOLD_L, 0))],
              center_ks({"o": kf([(0, 0), (15, 65), (45, 0)]),
                         "p": kf([(0, [100, 78, 0]), (OP // 2, [100, 56, 0]), (OP, [100, 78, 0])]),
                         "s": kf([(0, [50, 50, 100]), (OP // 2, [120, 150, 100]), (OP, [50, 50, 100])])}))
    return [bowl, rice, steam]

def arch_hall():
    hall = L("hall", [
        rect(60, 120, 80, 70, 2, (GOLD_L, 0), INK),     # 殿身
        poly([(44, 120), (100, 84), (156, 120)], (GOLD, 95), INK),  # 屋顶
        poly([(40, 120), (100, 78), (160, 120)], None, (INK_M, 3, 80)),
        rect(82, 132, 12, 46, 1, INK_D),
        rect(106, 132, 12, 46, 1, INK_D),
    ], center_ks({"s": breathe(102)}))
    glow = L("glow", [ellipse(100, 120, 130, 130, (GOLD, 5))], center_ks({"o": pulse(55)}))
    return [glow, hall]

def arch_cloud():
    cloud = L("cloud", [
        ellipse(74, 116, 56, 44, INK_M),
        ellipse(110, 110, 64, 52, INK_M),
        ellipse(132, 122, 46, 38, INK_M),
        ellipse(96, 128, 70, 40, INK_M),
    ], center_ks({"p": kf([(0, [100, 100, 0]), (OP // 2, [112, 100, 0]), (OP, [100, 100, 0])]),
                  "o": pulse(85)}))
    spark = L("spark", [star(150, 64, 4, 12, 5, GOLD)], center_ks({"o": pulse(50), "s": breathe(120)}))
    return [cloud, spark]

def arch_supplies():
    box = L("box", [
        rect(100, 110, 90, 70, 6, (GOLD_L, 0), INK),
        poly([(55, 110), (100, 86), (145, 110)], None, (INK_M, 3, 90)),
        line(100, 86, 100, 145, INK_M, 3),
        ellipse(100, 110, 22, 22, (GOLD, 92), INK),
    ], center_ks({"s": breathe(103)}))
    return [box]

def arch_service():
    # 双手托举 + 星点
    hands = L("hands", [
        poly([(50, 140), (80, 120), (100, 132), (120, 120), (150, 140)], (GOLD, 92), INK),
        poly([(50, 140), (80, 120), (100, 132), (120, 120), (150, 140)], None, (INK_M, 2, 60)),
    ], center_ks({"p": kf([(0, [100, 100, 0]), (OP // 2, [100, 96, 0]), (OP, [100, 100, 0])])}))
    offer = L("offer", [star(100, 86, 5, 22, 9, GOLD_D)],
              center_ks({"o": pulse(70), "s": breathe(115)}))
    return [hands, offer]

def arch_bio():
    leaf = L("leaf", [
        ellipse(100, 100, 56, 100, (GOLD, 92), INK),
        line(100, 56, 100, 144, INK_M, 3),
        line(100, 84, 80, 74, INK_M, 2),
        line(100, 84, 120, 74, INK_M, 2),
        line(100, 110, 80, 100, INK_M, 2),
        line(100, 110, 120, 100, INK_M, 2),
    ], center_ks({"r": kf([(0, -8), (OP // 2, 8), (OP, -8)]), "s": breathe(104)}))
    return [leaf]

def arch_obituary():
    plaque = L("plaque", [
        rect(100, 104, 86, 96, 14, (GOLD_L, 0), INK),
        ellipse(100, 60, 26, 20, (GOLD, 95), INK),
        line(78, 100, 122, 100, INK_M, 3),
        line(78, 118, 122, 118, INK_M, 2),
        line(78, 132, 122, 132, INK_M, 2),
        line(78, 146, 110, 146, INK_M, 2),
    ], center_ks({"o": pulse(88)}))
    return [plaque]

def arch_video():
    frame = L("frame", [rect(100, 100, 120, 90, 14, (GOLD_L, 0), INK),
                        rect(100, 100, 120, 90, 14, None, (GOLD, 3, 100))],
             center_ks({"s": breathe(103)}))
    play = L("play", [poly([(86, 74), (86, 126), (132, 100)], GOLD, INK_D)])
    ring = L("ring", [ellipse(100, 100, 130, 130, None, (GOLD, 2, 0))],
             center_ks({"o": kf([(0, 0), (12, 60), (36, 0)]),
                        "s": kf([(0, [70, 70, 100]), (36, [130, 130, 100]), (36, [70, 70, 100])])}))
    return [ring, frame, play]

def arch_meeting():
    p1 = L("p1", [ellipse(78, 92, 30, 30, INK_D), rect(78, 150, 44, 50, 8, (GOLD, 92), INK)],
          center_ks({"p": kf([(0, [78, 100, 0]), (OP // 2, [78, 96, 0]), (OP, [78, 100, 0])])}))
    p2 = L("p2", [ellipse(122, 92, 30, 30, INK_D), rect(122, 150, 44, 50, 8, (GOLD, 92), INK)],
          center_ks({"p": kf([(0, [122, 100, 0]), (OP // 2, [122, 96, 0]), (OP, [122, 100, 0])])}))
    link = L("link", [line(100, 120, 100, 132, GOLD_D, 4)])
    return [p1, p2, link]

def arch_qr():
    cells = []
    # 角标
    for (cx, cy) in [(64, 64), (136, 64), (64, 136)]:
        cells.append(rect(cx, cy, 34, 34, 4, INK_D))
        cells.append(rect(cx, cy, 18, 18, 2, (GOLD_L, 0)))
    # 散点
    import random
    random.seed(7)
    for _ in range(14):
        x = random.choice([88, 104, 120, 136, 152])
        y = random.choice([88, 104, 120, 136, 152])
        cells.append(rect(x, y, 14, 14, 2, INK_D if random.random() > 0.4 else GOLD_D))
    grid = L("grid", cells)
    scan = L("scan", [rect(100, 100, 168, 8, 2, (GOLD, 70))],
             center_ks({"o": c(70), "p": kf([(0, [100, 40, 0]), (OP, [100, 160, 0])])}))
    return [grid, scan]

def arch_decor():
    gem = L("gem", [star(100, 100, 4, 64, 26, GOLD, INK)],
            center_ks({"r": spin(20), "s": breathe(108)}))
    s1 = L("s1", [star(54, 56, 4, 12, 5, GOLD_D)], center_ks({"o": pulse(50), "s": breathe(120)}))
    s2 = L("s2", [star(150, 144, 4, 12, 5, GOLD_D)], center_ks({"o": pulse(50), "s": breathe(120)}))
    return [gem, s1, s2]

def arch_storage():
    box = L("box", [
        rect(100, 120, 96, 64, 6, (GOLD_L, 0), INK),
        poly([(52, 120), (100, 96), (148, 120)], None, (INK_M, 3, 90)),
        ellipse(100, 120, 16, 16, (GOLD, 92), INK),
    ])
    lid = L("lid", [rect(100, 96, 104, 16, 4, (GOLD, 95), INK),
                    rect(100, 88, 20, 12, 3, INK_D)],
            center_ks({"r": kf([(0, 0), (OP // 2, -22), (OP, 0)]),
                       "p": kf([(0, [100, 96, 0]), (OP // 2, [70, 70, 0]), (OP, [100, 96, 0])])}))
    return [box, lid]

# 注册表：archetype 名 -> 构建函数
ARCH = {
    "candle": arch_candle, "incense": arch_incense, "flower": arch_flower, "wreath": arch_wreath,
    "lantern": arch_lantern, "bell": arch_bell, "dove": arch_dove, "willow": arch_willow,
    "food": arch_food, "wine": arch_wine, "scripture": arch_scripture, "tea": arch_tea,
    "moon": arch_moon, "star": arch_star, "music": arch_music, "prayer": arch_prayer,
    "tree": arch_tree, "lotus": arch_lotus, "bow": arch_bow, "chime": arch_chime,
    "clean": arch_clean, "firework": arch_firework, "kite": arch_kite, "letter": arch_letter,
    "message": arch_message, "book": arch_book, "fruit": arch_fruit, "rice": arch_rice,
    "hall": arch_hall, "cloud": arch_cloud, "supplies": arch_supplies, "service": arch_service,
    "bio": arch_bio, "obituary": arch_obituary, "video": arch_video, "meeting": arch_meeting,
    "qr": arch_qr, "decor": arch_decor, "storage": arch_storage,
}

def _bad_sr(doc):
    """挑出自相矛盾的 `sr`（sy 与 ir 不配套）。

    见 star() 注释：`sy=2`（多边形）却带内径 `ir` 的写法不会报错，
    只会让 lottie 静默输出空 `<g>` —— 页面上一片空白，JSON 却看不出毛病。
    与其把空白图交到用户眼前，不如生成时就炸。
    """
    bad = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("ty") == "sr":
                want_ir = o.get("sy") == 1
                if ("ir" in o) != want_ir:
                    bad.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(doc)
    return bad


def build():
    out = "public/assets/lottie"
    os.makedirs(out, exist_ok=True)
    count = 0
    for name, fn in ARCH.items():
        _IND[0] = 0
        layers = fn()
        doc = {
            "v": "5.9.0", "fr": FR, "ip": 0, "op": OP, "w": 200, "h": 200,
            "nm": name, "ddd": 0, "assets": [], "layers": layers,
        }
        bad = _bad_sr(doc)
        if bad:
            raise SystemExit(
                f"❌ {name}.json 有自相矛盾的 sr（sy 与 ir 不配套，会渲染成空图）：{bad[0]}"
            )
        with open(os.path.join(out, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        count += 1
    print(f"✅ 生成 {count} 个墨金 Lottie 祭品图标 → {out}")

if __name__ == "__main__":
    build()
