"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  offerFreeTribute,
  offerPaidTribute,
  offerMessage,
  clearAltar,
} from "@/app/(public)/halls/[id]/actions";
import { useAmbientPlayer, TRACK_BY_SLUG } from "@/components/hall/useAmbientPlayer";
import { iconOf } from "@/lib/ritual";

/** 免费祭品：带剩余份数（每份用一次，每日补到配额） */
type FreeProduct = { id: string; name: string; slug: string; qty: number };
/**
 * 收费礼器：带剩余份数。
 * `owned` 的口径是「**持有过**」（OfferingHolding 里存在这一行），**不看 qty**——
 * 买过用尽后行仍在 → 按钮灰显而非消失；再买一次就自动点亮。
 * 从未买过 = 没有行 = 面板不渲染它。
 */
type LockedRitual = {
  id: string;
  name: string;
  slug: string;
  price: number;
  qty: number;
  owned: boolean;
};

/** 供台上的一件供品 */
type AltarItem = { id: string; slug: string; name: string };

type Effect = { key: number; kind: string };

/**
 * 按钮三级态 —— 「只显示我持有的供品」这条产品规则的落点：
 *   ready   有库存   → 可点，角标显示剩余份数
 *   empty   已持有但用尽 → 灰显「已用尽」，**不消失**
 *   hidden  从未持有 → **不渲染**（连价格牌都不出现，商城才是"逛"的地方）
 *
 * 免费祭器不走 hidden：`topUpFreeOfferings` 会在进馆时给所有免费礼器补货，
 * 所以它们天然"持有中"，用尽 → 次日自动点亮。这也是新用户不会看到空面板的原因。
 */
type BtnState =
  | { state: "ready"; product: FreeProduct | LockedRitual; qty: number }
  | { state: "empty"; product: FreeProduct | LockedRitual }
  | { state: "hidden"; product: null };


// slug → 动效类型（全部 30 个礼器：10 个免费 + 20 个可敬献解锁）
const EFFECT_KIND: Record<string, string> = {
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
 * 面板按钮：只定义「有哪些祭品、叫什么」，
 * 图标一律取自 lib/ritual 的权威表 —— 供台陈列与场景供台也用同一张表，
 * 否则同一件祭品在按钮上是 🎐、在供台上是 🔔，看起来像两样东西。
 */
const BUTTON_DEFS: { slug: string; label: string }[] = [
  { slug: "free-incense", label: "上香" },
  { slug: "free-flower", label: "献花" },
  { slug: "free-candle", label: "点烛" },
  { slug: "free-fruit", label: "供果" },
  { slug: "free-wine", label: "祭酒" },
  { slug: "free-tea", label: "清茶" },
  { slug: "free-clean", label: "擦拭" },
  { slug: "free-music", label: "音乐" },
  { slug: "free-message", label: "留言" },
  { slug: "free-letter", label: "天堂信箱" },
  { slug: "free-lantern", label: "河灯" },
  { slug: "free-lotus", label: "莲灯" },
  { slug: "free-kite", label: "纸鸢" },
  { slug: "free-dove", label: "白鸽" },
  { slug: "free-tree", label: "植树" },
  { slug: "free-willow", label: "插柳" },
  { slug: "free-wreath", label: "花环" },
  { slug: "free-bell", label: "风铃" },
  { slug: "free-chime", label: "撞钟" },
  { slug: "free-bow", label: "三鞠躬" },
  { slug: "free-prayer", label: "合十" },
  { slug: "free-scripture", label: "诵经" },
  { slug: "free-poem", label: "祭文" },
  { slug: "free-story", label: "往事" },
  { slug: "free-star", label: "心星" },
  { slug: "free-moon", label: "望月" },
  { slug: "free-firework", label: "烟花" },
  { slug: "free-food", label: "时馐" },
  { slug: "free-rice", label: "五谷" },
  { slug: "free-song", label: "点歌" },
];

const BUTTONS: { slug: string; icon: string; label: string }[] = BUTTON_DEFS.map((b) => ({
  ...b,
  icon: iconOf(b.slug),
}));

// Web Audio 合成音效：无需音频资源文件
function playTone(freqs: number[], duration = 1.6) {
  try {
    const ctx = new (window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

const SOUND: Record<string, number[]> = {
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

export default function WorshipPanel({
  hallId,
  freeProducts,
  lockedRituals = [],
  altarItems = [],
  isLoggedIn,
}: {
  hallId: string;
  freeProducts: FreeProduct[];
  /** 收费礼器：面板只展示 `owned === true`（持有过）的；未购的交给商城 */
  lockedRituals?: LockedRitual[];
  /** 当前供台上陈列的供品（持久，可手动撤供） */
  altarItems?: AltarItem[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [effects, setEffects] = useState<Effect[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [msgText, setMsgText] = useState("");
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 环境音：音乐类祭品在馆内循环播放，离开页面或撤供时停止
  const { play: playAmbient, stop: stopAmbient, playing: ambientPlaying } = useAmbientPlayer();
  /** slug → 图标（供台陈列用） */
  const ICON_BY_SLUG = useMemo(
    () => Object.fromEntries(BUTTONS.map((b) => [b.slug, b.icon])),
    [],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fire = useCallback((kind: string) => {
    const key = ++seq.current;
    setEffects((e) => [...e, { key, kind }]);
    const t = setTimeout(() => setEffects((e) => e.filter((x) => x.key !== key)), 4600);
    timers.current.push(t);
  }, []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    const t = setTimeout(() => setToast(""), 2600);
    timers.current.push(t);
  }, []);

  /** 判定某个 slug 处于三级态中的哪一级 */
  const btnState = useCallback(
    (slug: string): BtnState => {
      // 免费祭器：只要商品存在就占一个位子（用尽灰显、次日补货自动点亮）
      const free = freeProducts.find((p) => p.slug === slug);
      if (free) {
        return free.qty > 0
          ? { state: "ready", product: free, qty: free.qty }
          : { state: "empty", product: free };
      }
      const ritual = lockedRituals.find((p) => p.slug === slug);
      // 该 slug 无对应商品，或用户从未持有过 → 面板里根本不该有它
      if (!ritual || !ritual.owned) return { state: "hidden", product: null };
      return ritual.qty > 0
        ? { state: "ready", product: ritual, qty: ritual.qty }
        : { state: "empty", product: ritual };
    },
    [freeProducts, lockedRituals],
  );

  /** 面板里实际渲染的按钮（hidden 的 slug 已被剔除，网格不再留空格） */
  const visibleButtons = useMemo(
    () => BUTTONS.filter((b) => btnState(b.slug).state !== "hidden"),
    [btnState],
  );

  /** 统计文案用：持有中（可点）/ 已用尽（灰显） */
  const stats = useMemo(() => {
    let held = 0;
    let spent = 0;
    for (const b of visibleButtons) {
      const st = btnState(b.slug);
      if (st.state === "ready") held += 1;
      else if (st.state === "empty") spent += 1;
    }
    return { held, spent };
  }, [visibleButtons, btnState]);

  async function offer(slug: string) {
    const st = btnState(slug);

    // 用尽的收费祭品 → 去商城补货（补完即自动点亮）；用尽的免费祭品 → 明天会补
    if (st.state === "empty") {
      const p = st.product as LockedRitual;
      if (!freeProducts.some((f) => f.slug === slug)) router.push(`/mall/${p.slug}`);
      else showToast("今日份已用尽，明日再来～");
      return;
    }
    // hidden 不应有可点按钮，兜底不做任何事
    if (st.state === "hidden") return;

    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (slug === "free-message" || slug === "free-story" || slug === "free-poem") {
      setShowInput(true);
      return;
    }

    setBusy(slug);
    const isFree = freeProducts.some((f) => f.slug === slug);
    const res = isFree
      ? await offerFreeTribute(hallId, st.product.id)
      : await offerPaidTribute(hallId, st.product.id);
    setBusy("");
    if (res.ok) {
      const kind = EFFECT_KIND[slug] ?? "offering";
      fire(kind);
      // 音乐类祭品播放环境音（循环）；其余播放一次性合成音效。
      // 二者互斥 —— 否则一次性 blip 会打断刚起的氛围音。
      const track = TRACK_BY_SLUG[slug];
      if (track) playAmbient(track);
      else playTone(SOUND[kind] ?? SOUND.offering);
      router.refresh(); // 库存是服务端真相，不做乐观更新
    }
    showToast(res.message);
  }

  async function handleClearAltar() {
    setBusy("__clear");
    const res = await clearAltar(hallId);
    setBusy("");
    stopAmbient();
    showToast(res.message);
    router.refresh();
  }

  async function submitMessage() {
    const product = freeProducts.find((p) => p.slug === "free-message") ??
      freeProducts.find((p) => p.slug === "free-letter");
    if (!product) return;
    setBusy("free-message");
    const res = await offerMessage(hallId, product.id, msgText);
    setBusy("");
    if (res.ok) {
      fire("message");
      playTone(SOUND.message);
      setMsgText("");
      setShowInput(false);
    }
    showToast(res.message);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      {/* 祭拜舞台 */}
      <div className="relative h-64 overflow-hidden bg-gradient-to-b from-[#2b2118] via-[#3a2c1e] to-[#1c150e] sm:h-72">
        {/* 烛台 */}
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-14">
          {[0, 1].map((i) => (
            <div key={i} className="relative flex flex-col items-center">
              <div className="candle-flame h-7 w-4 rounded-[50%_50%_50%_50%/60%_60%_40%_40% bg-gradient-to-b from-amber-200 via-orange-400 to-red-500 opacity-70" />
              <div className="h-16 w-2.5 rounded-sm bg-gradient-to-b from-amber-100/90 to-amber-800" />
              <div className="h-2 w-10 rounded-full bg-amber-900/80" />
            </div>
          ))}
        </div>
        {/* 供台：正在供奉的祭品（持久陈列，可手动撤供） */}
        <div className="absolute bottom-0 left-1/2 w-[min(94%,560px)] -translate-x-1/2">
          {altarItems.length > 0 && (
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[11px] text-amber-200/70">
                供台 · {altarItems.length} 件{ambientPlaying && " · ♪ 乐起"}
              </span>
              <button
                type="button"
                onClick={handleClearAltar}
                disabled={busy === "__clear"}
                className="rounded border border-amber-200/30 px-2 py-0.5 text-[11px] text-amber-100/80 transition hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "__clear" ? "撤供中…" : "撤供"}
              </button>
            </div>
          )}
          <div className="flex min-h-[44px] items-end justify-center gap-1.5 rounded-t-md bg-gradient-to-b from-[#5a4632] to-[#3a2c1e] px-3 py-1.5 shadow-lg">
            {altarItems.map((a) => (
              <span
                key={a.id}
                className="text-xl drop-shadow"
                title={a.name}
                data-altar-slug={a.slug}
              >
                {ICON_BY_SLUG[a.slug] ?? "🕊️"}
              </span>
            ))}
            {altarItems.length === 0 && (
              <span className="text-[11px] text-amber-100/40">供台空空，献上一份心意</span>
            )}
          </div>
        </div>
        {/* 动效层 */}
        <div className="pointer-events-none absolute inset-0">
          {effects.map((e) => (
            <div key={e.key} className="absolute inset-0">
              {e.kind === "incense" && (
                <>
                  <div className="smoke absolute bottom-24 left-1/2 h-20 w-3 -translate-x-1/2 rounded-full bg-gradient-to-t from-white/25 to-transparent" />
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-2xl">🙏</div>
                </>
              )}
              {e.kind === "candle" && (
                <div className="candle-light absolute bottom-24 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-amber-300/30 blur-xl" />
              )}
              {e.kind === "flower" && (
                <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-3">
                  {["🌸", "🌼", "🌷"].map((f, i) => (
                    <span
                      key={i}
                      className="bloom inline-block text-3xl"
                      style={{ animationDelay: `${i * 0.25}s` }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {e.kind === "offering" && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="float-up inline-block">🥮</span>
                </div>
              )}
              {e.kind === "clean" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="wipe inline-block">✨</span>
                </div>
              )}
              {e.kind === "music" && (
                <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-4 text-2xl">
                  {["🎵", "🎶", "🎵"].map((m, i) => (
                    <span key={i} className="note-float inline-block" style={{ animationDelay: `${i * 0.3}s` }}>
                      {m}
                    </span>
                  ))}
                </div>
              )}
              {e.kind === "message" && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="letter-float inline-block">💌</span>
                </div>
              )}
              {e.kind === "lantern" && (
                <>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="lantern-rise absolute bottom-16 inline-block text-3xl"
                      style={{ left: `${40 + i * 10}%`, animationDelay: `${i * 0.7}s` }}
                    >
                      🏮
                    </span>
                  ))}
                </>
              )}
              {e.kind === "kite" && (
                <span className="kite-fly absolute bottom-20 left-1/3 inline-block text-4xl">🪁</span>
              )}
              {e.kind === "dove" && (
                <>
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className="dove-fly absolute bottom-24 inline-block text-3xl"
                      style={{ left: `${30 + i * 20}%`, animationDelay: `${i * 0.5}s` }}
                    >
                      🕊️
                    </span>
                  ))}
                </>
              )}
              {e.kind === "tree" && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-5xl">
                  <span className="tree-grow inline-block">🌳</span>
                </div>
              )}
              {e.kind === "sway" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="willow-sway inline-block">🌿</span>
                </div>
              )}
              {e.kind === "bell" && (
                <div className="absolute left-1/2 top-6 -translate-x-1/2 text-3xl">
                  <span className="bell-swing inline-block">🎐</span>
                  <span className="note-float absolute left-5 top-4 inline-block text-lg">🎵</span>
                </div>
              )}
              {e.kind === "bow" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="bow-anim inline-block">🙇</span>
                </div>
              )}
              {e.kind === "prayer" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="candle-light absolute -left-4 -top-3 inline-block h-14 w-14 rounded-full bg-amber-300/25 blur-lg" />
                  <span className="float-up relative inline-block">🙏</span>
                </div>
              )}
              {e.kind === "scroll" && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="letter-float inline-block">📜</span>
                </div>
              )}
              {e.kind === "star" && (
                <>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="star-twinkle absolute inline-block text-2xl"
                      style={{ left: `${20 + i * 20}%`, top: `${15 + (i % 2) * 20}%`, animationDelay: `${i * 0.4}s` }}
                    >
                      {i % 2 === 0 ? "⭐" : "✨"}
                    </span>
                  ))}
                </>
              )}
              {e.kind === "firework" && (
                <>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="firework-burst absolute inline-block text-3xl"
                      style={{ left: `${25 + i * 25}%`, top: `${10 + (i % 2) * 25}%`, animationDelay: `${i * 0.6}s` }}
                    >
                      🎆
                    </span>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/30 px-3 py-1 text-xs text-white/80">
          10 套免费动效 · 更多可敬献解锁
        </div>
      </div>

      {/* 供品面板：只列「我持有的」——从未买过的收费祭品不在此出现（去商城逛） */}      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-brand-900">
            祭品 · 一键祭拜
            <span className="ml-2 font-normal text-brand-400">
              {visibleButtons.length === 0
                ? "暂无可用供品"
                : `已持有 ${stats.held} 件${stats.spent > 0 ? ` · 用尽 ${stats.spent} 件` : ""}`}
            </span>
          </span>
          <span className="flex items-center gap-3 text-xs text-brand-400">
            <span>每份用一次 · 免费每日补 3 份</span>
            <a href="/mall" className="text-accent-600 hover:underline">
              去商城补充供品 →
            </a>
          </span>
        </div>

        {/*
          空态：新用户尚未持有任何供品时不渲染空网格，
          给一条明确的"去商城挑一件"的路，而不是让人对着空格猜。
        */}
        {visibleButtons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-brand-50/40 px-4 py-8 text-center">
            <p className="text-sm text-brand-500">还没有可供奉的祭品</p>
            <p className="mt-1 text-xs text-brand-400">
              免费祭品会在进馆时自动补足每日 3 份；收费礼器请去商城敬献后在馆内使用
            </p>
            <a
              href="/mall"
              className="mt-3 inline-block rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700"
            >
              去商城挑选供品
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {visibleButtons.map((b) => {
              const st = btnState(b.slug);
              const empty = st.state === "empty";
              const qty = st.state === "ready" ? st.qty : 0;
              return (
                <button
                  key={b.slug}
                  onClick={() => offer(b.slug)}
                  /*
                    用尽态必须真的 disabled：
                    否则它会带着 cursor-not-allowed 的灰样式却仍可点，
                    点了只弹一句 toast —— 视觉承诺（"不能点"）与行为不符。
                    补货入口在面板标题右侧的「去商城补充供品 →」。
                  */
                  disabled={empty || busy === b.slug}
                  title={
                    // 统一以「献上<名称>」开头，与宗祠面板保持一致，
                    // 也便于验收脚本用 button[title^="献上音乐"] 稳定定位。
                    empty ? `献上${b.label} · 已用尽` : `献上${b.label} · 剩余 ${qty} 份`
                  }
                  className={
                    empty
                      ? "flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-1 py-2.5 text-lg opacity-40"
                      : "flex flex-col items-center gap-1 rounded-lg border border-gray-100 bg-brand-50/50 px-1 py-2.5 text-lg transition hover:border-accent-300 hover:bg-accent-50 disabled:opacity-30"
                  }
                >
                  <span className={empty ? "opacity-60" : ""}>
                    {busy === b.slug ? "…" : b.icon}
                  </span>
                  <span className="text-[11px] text-brand-600">{b.label}</span>
                  {/* 剩余份数角标：用尽时显示「已用尽」而不是让按钮消失（重新购买即恢复点亮） */}
                  {empty ? (
                    <span className="text-[10px] font-semibold text-gray-400">已用尽</span>
                  ) : (
                    <span
                      className={
                        qty <= 1
                          ? "text-[10px] font-semibold text-amber-600"
                          : "text-[10px] font-semibold text-green-600"
                      }
                    >
                      ×{qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showInput && (
          <div className="mt-4 rounded-lg border border-gray-100 bg-brand-50/60 p-3">
            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="写下想对TA说的话、讲一段往事…（200字以内）"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowInput(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-brand-600"
              >
                取消
              </button>
              <button
                onClick={submitMessage}
                disabled={busy === "free-message"}
                className="rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === "free-message" ? "发送中…" : "送达"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast 反馈 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-900/90 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
