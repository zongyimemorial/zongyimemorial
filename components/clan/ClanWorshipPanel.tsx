"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { offerClanTribute, clearClanAltar } from "@/app/(public)/clan/halls/[id]/actions";
import { useAmbientPlayer, TRACK_BY_SLUG } from "@/components/hall/useAmbientPlayer";
import { SLUG_TO_ICON } from "@/lib/ritual";
/*
  动效/音效的唯一真相源见 lib/ritual-effects.ts。
  这里曾有一份与纪念馆面板**逐字节相同**的 30 条 EFFECT_KIND + 19 条 SOUND 副本 ——
  本次连同"祭文两个入口读不同数据源"是同一族问题：同一个真相写了两遍。
  现已抽为共享模块，改一处即两端生效。
*/
import { EFFECT_KIND, SOUND, playTone } from "@/lib/ritual-effects";

/**
 * qty = 剩余可献份数（消耗式库存，与纪念馆共用同一份）
 * owned = 是否**持有过**（OfferingHolding 里有这一行）。用尽后行仍在 → 灰显；从未持有 → 面板不展示。
 * 免费礼器不依赖 owned（进祠即自动补足配额，天然持有中）。
 */
type Item = {
  id: string;
  name: string;
  slug: string;
  pointsPrice?: number | null;
  qty: number;
  owned?: boolean;
};
type AltarItem = { id: string; slug: string; name: string };

type Effect = { key: number; kind: string };

/**
 * 宗祠献祭面板 —— 「祭拜舞台」版
 *
 * 升级：原先是扁平的横向供品条，现与纪念馆 WorshipPanel 同构 ——
 * 暗色祭拜舞台（烛台 + 供台持久陈列 + 撤供）+ 一键献祭网格 + 动效层。
 * 保留宗祠自身语义：积分供奉、祭文弹窗、共祭脱敏记录（均在页面其余部分）。
 * 深浅色由 props 的 tone 控制舞台下方的内容区（舞台恒为暗色，与纪念馆一致）。
 */
export default function ClanWorshipPanel({
  clanHallId,
  freeProducts,
  paidProducts = [],
  poemProduct: poemProductProp,
  altarItems = [],
  isLoggedIn,
  points = 0,
  tone = "light",
}: {
  clanHallId: string;
  freeProducts: Item[];
  paidProducts?: Item[];
  /** 祭文礼器（free-poem）。已转收费，故不能从 freeProducts 里找，由父级单独传入。 */
  poemProduct?: Item | null;
  /** 当前供台上陈列的供品（持久，可手动撤供） */
  altarItems?: AltarItem[];
  isLoggedIn: boolean;
  points?: number;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [effects, setEffects] = useState<Effect[]>([]);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 环境音：音乐类祭品在祠内循环播放，离开页面或撤供时停止
  const { play: playAmbient, stop: stopAmbient, playing: ambientPlaying } = useAmbientPlayer();

  const dark = tone === "dark";

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** 触发一次性动效（4.6s 后自动移除，与纪念馆同生命周期） */
  const fire = useCallback((kind: string) => {
    const key = ++seq.current;
    setEffects((e) => [...e, { key, kind }]);
    const t = setTimeout(() => setEffects((e) => e.filter((x) => x.key !== key)), 4600);
    timers.current.push(t);
  }, []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    const t = setTimeout(() => setToast(""), 2800);
    timers.current.push(t);
  }, []);

  async function submit(product: Item, message?: string) {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (product.qty <= 0) {
      showToast("该祭品已用尽，请先补充");
      return;
    }
    setBusy(product.slug);
    try {
      const res = await offerClanTribute(clanHallId, product.id, message);
      showToast(res.message);
      if (res.ok) {
        setMsgText("");
        setShowMsg(false);
        // 与纪念馆同款反馈链：动效 → 音效（音乐类走循环环境音，互斥）
        fire(EFFECT_KIND[product.slug] ?? "offering");
        const track = TRACK_BY_SLUG[product.slug];
        if (track) playAmbient(track);
        else playTone(SOUND[EFFECT_KIND[product.slug] ?? "offering"] ?? SOUND.offering);
        router.refresh();
      }
    } catch {
      showToast("献祭失败，请稍后重试");
    } finally {
      setBusy("");
    }
  }

  async function handleClearAltar() {
    setBusy("__clear");
    const res = await clearClanAltar(clanHallId);
    setBusy("");
    stopAmbient();
    showToast(res.message);
    router.refresh();
  }

  // 常用免费祭品（按宗祠语义排序，找不到的商品自动跳过）
  // 注意：这 8 个必须都落在免费名单内，否则按钮会缺项。
  // 产品体系重构后 free-food（时馐）与 free-rice（五谷）已转收费，
  // 故用 free-clean（擦拭墓碑）与 free-bow（三鞠躬）补位，保持 8 个全亮。
  const ORDER = [
    "free-incense",
    "free-flower",
    "free-candle",
    "free-fruit",
    "free-wine",
    "free-tea",
    "free-clean",
    "free-bow",
  ];
  // 图标统一取自 lib/ritual 的权威表 —— 保证面板按钮与供台陈列、场景供台长得一致
  const ICONS = SLUG_TO_ICON;
  /** 短标签：第一行的 8 个常用位 + 第二行里需要缩写的几个 */
  const LABELS: Record<string, string> = {
    "free-incense": "上香",
    "free-flower": "献花",
    "free-candle": "点烛",
    "free-fruit": "供果",
    "free-wine": "祭酒",
    "free-tea": "清茶",
    "free-clean": "擦拭",
    "free-bow": "三鞠躬",
    // 第二行（我的其它供品）的短名：保持两三个字，按钮宽度才整齐
    "free-music": "音乐",
    "free-song": "点歌",
    "free-message": "留言",
    "free-letter": "信箱",
    "free-poem": "祭文",
    "free-scripture": "诵经",
    "free-prayer": "合十",
    "free-story": "往事",
    "free-food": "时馐",
    "free-rice": "五谷",
    "free-moon": "望月",
    "free-star": "心星",
    "free-bell": "风铃",
    "free-chime": "撞钟",
    "free-lantern": "河灯",
    "free-lotus": "莲灯",
    "free-kite": "纸鸢",
    "free-dove": "白鸽",
    "free-tree": "植树",
    "free-willow": "插柳",
    "free-wreath": "花环",
    "free-firework": "烟花",
  };
  const buttons = ORDER.map((slug) => freeProducts.find((p) => p.slug === slug)).filter(
    (p): p is Item => !!p,
  );
  /*
    「我的其它供品」第二行 —— **持有的免费 + 持有的收费都在这里**。
    用尽的收费品也留在这里并灰显 —— 与纪念馆面板一致。

    ⚠️ 祭文（free-poem）**不能一并排除**。
    它是收费礼器（¥5 / 800 积分），由父级单独以 poemProduct 传入，不在 freeProducts 里；
    早先这里把它 filter 掉、只在下方留一颗「写一段祭文」的文字按钮，
    而那颗按钮**完全不看库存** —— 于是 qty 归零后它照样高亮可点，
    点下去只弹一句「该祭品已用尽」（用户反馈：「祭文已经用尽，但没有显示灰色」）。
    现在把祭文并进这一行：和其它供品共用同一套 empty/btn 样式与 ×N 角标，
    库存耗尽即灰显「已用尽」。下方仍保留文字入口（作为"写祭文"的语义入口）。
  */
  const extraButtons = [...freeProducts, ...paidProducts]
    .filter((p) => !ORDER.includes(p.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  /*
    祭文库存合并口径：父级传入优先，其次从 freeProducts 回退，再不行从 paidProducts 找。
    早期只查前两处，未传 poemProduct 的调用点会拿到 qty=0 的假"已用尽"。
  */
  const poemProduct =
    poemProductProp ??
    freeProducts.find((p) => p.slug === "free-poem") ??
    paidProducts.find((p) => p.slug === "free-poem") ??
    null;

  /*
    积分供奉区：卡片式的那一排，只在**有可用余量**时出现。
    祭文已在上一行展示（含灰显态），此处不重复。
  */
  const paidAvailable = paidProducts.filter((p) => p.qty > 0 && p.slug !== "free-poem");

  const btnCls = dark
    ? "flex flex-col items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-3 text-sm text-white/90 hover:bg-white/20 disabled:opacity-40"
    : "flex flex-col items-center gap-1 rounded-lg border border-brand-200 bg-white/80 px-2 py-3 text-sm text-brand-800 shadow-sm hover:border-accent-400 hover:bg-accent-50 disabled:opacity-40";

  /** 用尽的按钮灰显但不隐藏 —— 布局稳定，用户也知道东西还在、只是用完了 */
  const emptyCls = dark
    ? "flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-3 text-sm text-white/35"
    : "flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border border-brand-200 bg-brand-100/70 px-2 py-3 text-sm text-brand-400";

  /** 供台图标：直接查权威表，未知 slug 兜底 */
  const ICON_BY_SLUG = ICONS;

  return (
    <div className="mt-4">
      {/* ===== 祭拜舞台（与纪念馆 WorshipPanel 同构）：烛台 + 供台陈列 + 撤供 + 动效 ===== */}
      <div className="relative mb-4 h-56 overflow-hidden rounded-xl bg-gradient-to-b from-[#2b2118] via-[#3a2c1e] to-[#1c150e] sm:h-64">
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
        {/* 供台：正在供奉的供品（持久陈列，可手动撤供） */}
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
        {/* 动效层（与纪念馆同款动画类，globals.css 全局复用） */}
        <div className="pointer-events-none absolute inset-0">
          {effects.map((e) => (
            <div key={e.key} className="absolute inset-0">
              {e.kind === "incense" && (
                <>
                  <div className="smoke absolute bottom-24 left-1/2 h-20 w-3 -translate-x-1/2 rounded-full bg-gradient-to-t from-brand-50/25 to-transparent" />
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
          敬奉先祖 · 香火延续
        </div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 text-sm ${dark ? "text-white/70" : "text-brand-500"}`}>
        <span>免费祭品 · 一键献祭</span>
        <span>
          每次 +2 积分 · 每份用一次 · 每日领 1 份
          {isLoggedIn ? ` · 我的积分 ${points}` : " · 请先登录"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {buttons.map((p) => {
          const empty = p.qty <= 0;
          return (
            <button
              key={p.slug}
              type="button"
              disabled={busy === p.slug || empty}
              onClick={() => submit(p)}
              className={empty ? emptyCls : btnCls}
              title={
                empty ? `献上${LABELS[p.slug] ?? p.name} · 已用尽` : `献上${LABELS[p.slug] ?? p.name}`
              }
            >
              <span className="text-2xl leading-none">{ICONS[p.slug] ?? "🕊️"}</span>
              <span>{LABELS[p.slug] ?? p.name}</span>
              <span
                className={
                  empty
                    ? "text-xs font-semibold opacity-70"
                    : p.qty <= 1
                      ? "text-xs font-semibold text-amber-600"
                      : "text-xs font-semibold text-green-700"
                }
              >
                {empty ? "已用尽" : `×${p.qty}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 其余持有的供品（音乐、河灯、烟花…免费与收费都在此），避免"有货却没入口" */}
      {extraButtons.length > 0 && (
        <div className="mt-2">
          <p className={`text-sm ${dark ? "text-white/50" : "text-brand-400"}`}>
            我的其它供品 · {extraButtons.filter((p) => p.qty > 0).length}/{extraButtons.length} 件可用
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {extraButtons.map((p) => {
              const empty = p.qty <= 0;
              return (
                <button
                  key={p.slug}
                  type="button"
                  disabled={busy === p.slug || empty}
                  onClick={() => submit(p)}
                  className={empty ? emptyCls : btnCls}
                  title={
                    empty
                      ? `献上${LABELS[p.slug] ?? p.name} · 已用尽`
                      : `献上${LABELS[p.slug] ?? p.name} · 余 ${p.qty} 份`
                  }
                >
                  <span className="text-2xl leading-none">{ICONS[p.slug] ?? "🕊️"}</span>
                  <span>{LABELS[p.slug] ?? p.name}</span>
                  <span
                    className={
                      empty
                        ? "text-xs font-semibold opacity-70"
                        : p.qty <= 1
                          ? "text-xs font-semibold text-amber-600"
                          : "text-xs font-semibold text-green-700"
                    }
                  >
                    {empty ? "已用尽" : `×${p.qty}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 祭文 / 留言 —— 语义入口，与上方「祭文」卡片同一份库存 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(() => {
          /*
            耗尽时必须**真的 disabled 且灰显**，而不是"点下去才弹一句已用尽"。
            视觉承诺（看起来能点）与行为（点了没反应）必须一致；
            补货入口就在面板下方那行「去商城补充供品 →」。
          */
          /*
            「商品不存在」与「已用尽」是两件事，文案必须分开：
            前者是上架状态问题（用户什么也做不了，只能去商城看别的），
            后者是配额问题（补一份就能继续写）。混成一句"已用尽"会让人
            以为补货就能解决，白跑一趟。
          */
          const poemSoldOut = !poemProduct;
          const poemEmpty = poemSoldOut || poemProduct.qty <= 0;
          return (
            <button
              type="button"
              disabled={poemEmpty}
              onClick={() => {
                if (!isLoggedIn) return router.push("/login");
                setShowMsg(true);
              }}
              title={
                poemSoldOut
                  ? "祭文礼器暂未上架"
                  : poemEmpty
                    ? "祭文 · 已用尽（去商城补充）"
                    : `祭文 · 余 ${poemProduct?.qty} 份`
              }
              className={
                poemEmpty
                  ? "cursor-not-allowed rounded-md border px-3 py-1.5 text-sm " +
                    (dark
                      ? "border-white/10 bg-white/5 text-white/35"
                      : "border-brand-200 bg-brand-100/70 text-brand-400")
                  : dark
                    ? "rounded-md border border-white/25 px-3 py-1.5 text-sm text-white/90 hover:bg-white/15"
                    : "rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
              }
            >
              写一段祭文 · 留言追思
              {poemSoldOut ? (
                <span className="ml-1.5 text-xs">暂未上架</span>
              ) : poemEmpty ? (
                <span className="ml-1.5 text-xs">已用尽</span>
              ) : (
                <span className="ml-1.5 text-xs opacity-70">×{poemProduct?.qty}</span>
              )}
            </button>
          );
        })()}
        {/*
          用尽时**就地**给一颗「去补充」。
          祭文是宗祠里唯一带弹窗、带书写动作的仪式入口，用尽后若只留一句灰字，
          用户得自己往下找到面板底部那行小小的「去商城补充供品 →」才算找到出口。
          补货入口应当长在**提醒它的地方**，而不是让人多找一步。
          只在耗尽时出现：有货时出现会与主操作抢焦点。

          链接目标**取自库里的真实 slug**（poemProduct.slug 是 findFirst 按 slug 查出来的），
          不是写死的 "free-poem"。这样哪天商品改了 slug，入口会跟着走而不是指向 404。
          真查不到商品时（poemProduct 为空）退回商城首页 —— 商品页对无效 slug 会 notFound()，
          与其跳进 404，不如退到"能自己挑"的地方。
        */}
        {(!poemProduct || poemProduct.qty <= 0) && (
          <>
            <a
              href={poemProduct ? `/mall/${poemProduct.slug}` : "/mall"}
              className={
                "rounded-md border px-3 py-1.5 text-sm font-semibold transition " +
                (dark
                  ? "border-amber-300/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
                  : "border-accent-300 bg-accent-50 text-accent-800 hover:bg-accent-100")
              }
            >
              去补充祭文 →
            </a>
            <span className={"text-sm " + (dark ? "text-white/60" : "text-brand-500")}>
              {poemProduct
                ? "祭文每日可用份数有限，补充后即可继续书写"
                : "祭文礼器暂未上架，可先去商城看看其它供品"}
            </span>
          </>
        )}
      </div>

      {/*
        积分供奉：**只列我已持有的**（qty > 0）。
      */}
      {paidAvailable.length > 0 && (
        <div className="mt-4">
          <p className={`text-sm ${dark ? "text-white/70" : "text-brand-500"}`}>
            积分供奉 · 已持有 {paidAvailable.length} 件（消耗积分，计入宗祠账目）
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {paidAvailable.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy === p.slug}
                onClick={() => submit(p)}
                title={`${p.name} · 余 ${p.qty} 份`}
                className={
                  dark
                    ? "rounded-md border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/25 disabled:opacity-40"
                    : "rounded-md border border-accent-300 bg-accent-50 px-3 py-2 text-sm text-accent-800 hover:bg-accent-100 disabled:opacity-40"
                }
              >
                {p.name}
                {p.pointsPrice ? ` · ${p.pointsPrice} 积分` : ""}
                <span className="ml-1 opacity-70">×{p.qty}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        补货引导：面板只列持有的，那"没得用"时就得有个明确的去处。
        注意深浅两套色**都**要提亮：旧写法浅底给 brand-400、深底给 white/50，
        两档都在各自背景上贴着"可以忽略"的灰度，等于把唯一的行动指引藏了起来。
        现在浅底 → brand-700，深底 → white/85，字号 base、字重 semibold。
      */}
      <p className={`mt-3 text-base font-semibold ${dark ? "text-white/85" : "text-brand-700"}`}>
        面板只展示我持有的供品，用尽后灰显 ·
        <a
          href="/mall"
          className={`ml-1 underline hover:no-underline ${dark ? "text-amber-200" : "text-accent-700"}`}
        >
          去商城补充供品 →
        </a>
      </p>

      {/* 祭文弹窗 */}
      {showMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-brand-200 bg-brand-50 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-brand-900">祭文 · 留言追思</h3>
            <p className="mt-1 text-sm text-brand-400">写下缅怀与祈愿，将随祭祀记录一并留存（200 字以内）</p>
            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              rows={4}
              maxLength={200}
              placeholder="伏惟尚飨……"
              className="mt-3 w-full rounded-md border border-brand-200 bg-brand-100/70 px-3 py-2 text-base outline-none focus:border-brand-500"
            />
            <div className="mt-1 text-right text-sm text-brand-300">{msgText.length}/200</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMsg(false)}
                className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy !== "" || !msgText.trim() || !poemProduct || poemProduct.qty <= 0}
                onClick={() => poemProduct && submit(poemProduct, msgText)}
                className="rounded-md bg-brand-800 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
              >
                献上
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 反馈 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-900/90 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
