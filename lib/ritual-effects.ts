/*
  lib/ritual-effects.ts —— 祭品动效与音效的**唯一真相源**

  为什么要抽这个文件：
  在它之前，`EFFECT_KIND`（slug → 动效）、`SOUND`（音效频率表）、`playTone`（Web Audio 合成）
  在三个面板组件里各抄了一份：

    components/hall/WorshipPanel.tsx        30 条映射 + 19 条音效
    components/clan/ClanWorshipPanel.tsx    30 条映射 + 19 条音效（与上面**逐字节相同**）
    components/memorial/PublicWorshipPanel.tsx  4 条映射（键空间不同）+ 7 条音效（子集）

  前两份完全一致这件事本身就是风险：**谁先改谁就对不上**。
  典型症状是"同一件祭品在纪念馆是烟雾、在宗祠是绽放"——不报错、不崩溃，
  只有肉眼能发现。这正是本项目反复踩的"同一真相写在多处"那一类坑，
  与"祭文两个入口读不同数据源"是同族问题。

  ⚠️ 三类内容的口径差异（别误合并）：
  1. `EFFECT_KIND` 是 **slug → 动效**（如 "free-incense" → "incense"）；
     公益馆的键是 **祭品 type → 动效**（"incense"/"flower"/"candle"/"elegy"），
     键空间不同，故它保留自己的 `MEMORIAL_EFFECT_KIND`，只共用 SOUND/playTone。
  2. `SOUND` 用**全集**：公益馆原先只用 7 条，现已并入全集 —— 多出来的键
     对它是死代码，不产生任何行为变化，但省掉了"哪天公益馆要用 music 音效
     却发现表里没有"的二次排查。
  3. 动效名（"incense"/"candle"…）必须与 app/globals.css 里的动画类名同级对齐：
     CSS 定义 `.candle-flame`、`.bloom`、`.lantern-rise` 等，面板按 kind 选渲染分支。
*/

/**
 * 祭品 slug → 动效类型。
 * 覆盖全部 30 件礼器（10 免费 + 20 可解锁），与 lib/ritual.ts 的权威 slug 表一一对应。
 */
export const EFFECT_KIND: Record<string, string> = {
  "free-incense": "incense",
  "free-candle": "candle",
  "free-flower": "flower",
  "free-wine": "offering",
  "free-fruit": "offering",
  "free-tea": "offering",
  "free-clean": "clean",
  "free-music": "music",
  "free-message": "message",
  "free-letter": "message",
  "free-lantern": "lantern",
  "free-lotus": "lantern",
  "free-kite": "kite",
  "free-dove": "dove",
  "free-tree": "tree",
  "free-willow": "sway",
  "free-wreath": "flower",
  "free-bell": "bell",
  "free-chime": "bell",
  "free-bow": "bow",
  "free-prayer": "prayer",
  "free-scripture": "prayer",
  "free-poem": "scroll",
  "free-story": "scroll",
  "free-star": "star",
  "free-moon": "star",
  "free-firework": "firework",
  "free-food": "offering",
  "free-rice": "offering",
  "free-song": "music",
};

/**
 * 公益纪念堂的动效表：键是**祭品 type**（不是 slug），故无法并入 EFFECT_KIND。
 * 见 lib/memorial.ts 的 FREE_PUBLIC_OFFERINGS —— 那边的 `type` 取 flower/incense/candle/elegy。
 */
export const MEMORIAL_EFFECT_KIND: Record<string, string> = {
  flower: "flower",
  incense: "incense",
  candle: "candle",
  elegy: "prayer",
};

/** slug → 动效类型（未登记时回落 offering，与各面板原有兜底一致） */
export function effectOf(slug: string): string {
  return EFFECT_KIND[slug] ?? "offering";
}

/** 动效类型 → 合成音效频率（Hz 序列） */
export const SOUND: Record<string, number[]> = {
  incense: [523.25, 783.99],
  candle: [659.25, 987.77],
  flower: [587.33, 880],
  offering: [493.88, 739.99],
  clean: [440, 659.25],
  music: [523.25, 659.25, 783.99, 1046.5],
  message: [698.46, 1046.5],
  lantern: [440, 554.37, 659.25],
  kite: [587.33, 739.99],
  dove: [659.25, 880, 987.77],
  tree: [392, 523.25],
  sway: [523.25, 698.46],
  bell: [880, 1174.66],
  bow: [329.63, 440],
  prayer: [493.88, 659.25, 987.77],
  scroll: [523.25, 659.25],
  star: [1046.5, 1318.5],
  firework: [587.33, 880, 1174.66, 1567.98],
};

/**
 * 用 Web Audio 合成一段音效 —— **无需任何音频资源文件**。
 * 这是一次性的"叮"（与 useAmbientPlayer 的循环环境音互斥，见各面板的调用点）。
 */
export function playTone(freqs: number[], duration = 1.6) {
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.1);
    });
    setTimeout(() => ctx.close(), (duration + freqs.length * 0.18) * 1000 + 300);
  } catch {
    /* 浏览器不支持时静默 */
  }
}

/** 便捷封装：按动效类型播一下（查不到就播 offering 的） */
export function playEffectSound(kind: string, duration = 1.6) {
  playTone(SOUND[kind] ?? SOUND.offering, duration);
}
