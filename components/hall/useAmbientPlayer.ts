"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 环境音乐播放器。
 *
 * 音乐类祭品（点歌、供奉音乐、诵经…）祭拜后，在馆内/宗祠空间内**循环播放**对应的
 * 氛围音轨，直到用户离开页面或撤供。音轨是 36 秒无缝循环的合成音频
 * （见 scripts/gen-ambient.mjs），放在 public/assets/ambient/ 由 Next 静态托管。
 *
 * 自动播放策略：浏览器拦截"无用户手势"的播放。这里的播放**始终由点击祭品触发**，
 * 点击本身就是手势，所以允许。绝不要在 useEffect 里自动开播 —— 那会被拦截。
 */

/** 音轨常量：4 条曲目 */
export const AMBIENT = {
  guqin: "/assets/ambient/guqin.mp3", // 古琴：清远内敛
  fanyin: "/assets/ambient/fanyin.mp3", // 梵音：诵经回向
  bell: "/assets/ambient/bell.mp3", // 梵钟：一击一悟
  kongling: "/assets/ambient/kongling.mp3", // 空灵琴：遥寄追思
} as const;

/**
 * slug → 音轨 URL；值为 null（或键不存在）= 该祭品只播一次性合成音效。
 *
 * 30 个礼器全量覆盖：实物供品（花果茶酒）不配环境音，避免"供个水果还放 BGM"的违和感。
 */
export const TRACK_BY_SLUG: Record<string, string | null> = {
  // 古琴：追思、寄言、礼仪
  "free-incense": AMBIENT.guqin,
  "free-clean": AMBIENT.guqin,
  "free-bow": AMBIENT.guqin,
  "free-message": AMBIENT.guqin,
  "free-letter": AMBIENT.guqin,
  "free-poem": AMBIENT.guqin,
  "free-story": AMBIENT.guqin,
  "free-song": AMBIENT.guqin,
  // 梵音：诵经、祈福、供奉
  "free-prayer": AMBIENT.fanyin,
  "free-scripture": AMBIENT.fanyin,
  "free-food": AMBIENT.fanyin,
  "free-rice": AMBIENT.fanyin,
  "free-tree": AMBIENT.fanyin,
  "free-willow": AMBIENT.fanyin,
  // 梵钟：钟铃、星月、烟花
  "free-bell": AMBIENT.bell,
  "free-chime": AMBIENT.bell,
  "free-star": AMBIENT.bell,
  "free-moon": AMBIENT.bell,
  "free-firework": AMBIENT.bell,
  // 空灵琴：灯、乐器、飞升之物
  "free-music": AMBIENT.kongling,
  "free-candle": AMBIENT.kongling,
  "free-lantern": AMBIENT.kongling,
  "free-lotus": AMBIENT.kongling,
  "free-kite": AMBIENT.kongling,
  "free-dove": AMBIENT.kongling,
  "free-wreath": AMBIENT.kongling,
  // 实物供品：不播环境音
  "free-flower": null,
  "free-fruit": null,
  "free-tea": null,
  "free-wine": null,
};

export function useAmbientPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.volume = 0.45;
    /*
      把它挂进 DOM（隐藏），而不是留成游离节点。
      游离的 <audio> 播得了，但 document.querySelector("audio") 找不到 ——
      验收脚本、以及任何"页面上到底有没有在放音乐"的排查都会得出错误的否定结论。
      挂上之后 hidden + aria-hidden，对用户完全不可见。
    */
    el.setAttribute("data-ambient-player", "");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    audioRef.current = el;
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.remove();
      audioRef.current = null;
    };
  }, []);

  /** 播放某条音轨（切换音轨时从当前音轨换过去，同一首不重启） */
  const play = useCallback((src: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (el.getAttribute("data-src") === src && !el.paused) {
      setPlaying(true);
      return;
    }
    el.setAttribute("data-src", src);
    el.src = src;
    el.play()
      .then(() => setPlaying(true))
      // 浏览器策略拦截时静默失败，不影响祭拜本身
      .catch(() => setPlaying(false));
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    // 清掉 src，否则验收脚本/无头浏览器里 `querySelector("audio")` 仍会看到
    // 一个"加载了音轨但已暂停"的元素，容易被误读成"还在播"。
    // 用 removeAttribute 而不是 el.src = ""：后者会让 currentSrc 变成页面 URL。
    el.removeAttribute("src");
    el.removeAttribute("data-src");
    el.load();
    setPlaying(false);
  }, []);

  return { play, stop, playing };
}
