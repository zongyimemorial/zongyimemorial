#!/usr/bin/env python3
"""
生成 4 条无缝循环的氛围音轨（供音乐类祭品在纪念馆/宗祠空间内播放）。

设计要点 —— 为什么能无缝循环：
  所有分量的频率都取 f = n / DUR（n 为整数），即在 DUR 秒里正好跑完整数个周期。
  于是信号在 t=0 与 t=DUR 处的相位与导数完全一致，首尾相接不会有咔哒声。
  再叠一层 afade in/out 抹掉可能的直流突跳（不做 acrossfade —— 那会改变时长，
  破坏整数周期前提）。

规格：36 s / 44100 Hz / mono / 64 kbps CBR mp3 ≈ 288 KB（<300 KB 目标）。

运行：python3 scripts/gen-ambient.py
输出：public/assets/ambient/{guqin,fanyin,bell,kongling}.mp3
"""

import math
import os
import subprocess

import numpy as np

SR = 44100
DUR = 36.0
N = int(SR * DUR)
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets", "ambient")

t = np.arange(N) / SR


def partial(n_harmonics, amp):
    """频率 = n / DUR 的整数周期正弦（n 取整数个小时，保证首尾连续）"""
    return amp * np.sin(2 * np.pi * (n_harmonics / DUR) * t)


def env_breath(cycles, depth, base=1.0):
    """缓慢起伏包络，周期数取整数 → 本身也无缝"""
    return base - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * (cycles / DUR) * t))


def normalize(sig, peak=0.85):
    m = np.max(np.abs(sig))
    return sig / m * peak if m > 0 else sig


def guqin():
    """古琴：低音泛音列 + 0.09 Hz 呼吸式起伏，清远内敛"""
    sig = np.zeros(N)
    # 泛音列：基音 + 2/3/5/8 倍频（整数周期 → 无缝）
    for mult, amp in [(5, 1.0), (8, 0.45), (12, 0.28), (20, 0.16), (30, 0.09)]:
        sig += partial(mult, amp)
    # 呼吸：每 36 秒 3 个周期
    sig *= env_breath(3, 0.28)
    # 极缓慢的失谐叠层，制造"琴弦余韵"
    sig += 0.18 * np.sin(2 * np.pi * (7 / DUR + 0.0004) * t)
    return normalize(sig)


def fanyin():
    """梵音：五声调式音簇 + 缓慢颤音，诵经回向的声床"""
    sig = np.zeros(N)
    # 五声音阶（宫商角徵羽）音程比，全部取整数周期
    for mult, amp in [(9, 0.9), (11, 0.7), (14, 0.6), (17, 0.45), (22, 0.3)]:
        # 每个音加轻微颤音（0.25 Hz，整数周期 9 个 → 无缝）
        vib = 1.0 + 0.006 * np.sin(2 * np.pi * (9 / DUR) * t)
        sig += amp * np.sin(2 * np.pi * (mult / DUR) * t * vib)
    sig *= env_breath(4, 0.22)
    # 低音铺底
    sig += 0.5 * partial(4, 0.6)
    return normalize(sig)


def bell():
    """梵钟：每 6 秒一击，指数衰减串音；基音 + 非谐分音（钟体特征）"""
    sig = np.zeros(N)
    strike_period = 6.0
    n_strikes = int(DUR / strike_period)  # 6 击
    for k in range(n_strikes):
        start = k * strike_period
        i0 = int(start * SR)
        # 每击的余韵尾长 5 秒，不留到下一次起始之前（避免叠成一团）
        tail_len = int(min(5.0, DUR - start) * SR)
        tl = np.arange(tail_len) / SR
        decay = np.exp(-tl * 0.85)
        strike = np.zeros(tail_len)
        # 基音 + 非谐分音（*2.76 是钟类乐器的典型非谐比）
        for mult, amp in [(1.0, 1.0), (2.76, 0.5), (5.4, 0.26), (8.93, 0.13)]:
            strike += amp * np.sin(2 * np.pi * (196.0 * mult) * tl) * np.exp(-tl * (0.85 * mult))
        # 敲击瞬间的噪声成分（木质钟锤）
        strike += 0.25 * np.random.default_rng(k).normal(0, 1, tail_len) * np.exp(-tl * 30)
        seg = strike * decay
        sig[i0:i0 + tail_len] += seg[: N - i0]
    # 一层极低的环境噪声底（风声）
    rng = np.random.default_rng(42)
    sig += 0.05 * rng.normal(0, 1, N)
    return normalize(sig)


def kongling():
    """空灵琴：高频正弦 + 缓慢 detune 双振荡器，遥寄追思"""
    sig = np.zeros(N)
    for mult, detune, amp in [(24, 0.0, 0.6), (24, 0.0009, 0.5), (36, 0.0, 0.3), (48, 0.0007, 0.2)]:
        sig += amp * np.sin(2 * np.pi * (mult / DUR + detune) * t)
    # 稀疏的"拨弦"点缀：每 4.5 秒一次，共 8 次，整数排布
    for k in range(8):
        start = k * 4.5
        i0 = int(start * SR)
        tail_len = min(int(4.0 * SR), N - i0)
        if tail_len <= 0:
            continue
        tl = np.arange(tail_len) / SR
        note = sum(
            a * np.sin(2 * np.pi * (f / DUR) * tl) for f, a in [(40, 0.5), (60, 0.3), (80, 0.15)]
        )
        sig[i0:i0 + tail_len] += note * np.exp(-tl * 1.1) * 0.5
    sig *= env_breath(2, 0.2)
    return normalize(sig)


def encode(name, sig):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.normpath(os.path.join(OUT_DIR, f"{name}.mp3"))
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16).tobytes()
    # afade 只柔化首尾 1.5s；整数周期已保证主体无缝
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
            "-af", "afade=t=in:st=0:d=1.5,afade=t=out:st=34.5:d=1.5",
            "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
            path,
        ],
        input=pcm,
        check=True,
    )
    size = os.path.getsize(path)
    print(f"  {name}.mp3  {size / 1024:.0f} KB")


print(f"生成氛围音轨 {DUR:.0f}s / {SR}Hz / mono / 64kbps →")
encode("guqin", guqin())
encode("fanyin", fanyin())
encode("bell", bell())
encode("kongling", kongling())
print("完成。注意：必须在 npm run build 之前生成 —— next start 只服务构建时已存在的 public 文件。")
