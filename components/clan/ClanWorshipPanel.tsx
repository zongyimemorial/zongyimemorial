"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { offerClanTribute, clearClanAltar } from "@/app/(public)/clan/halls/[id]/actions";
import { useAmbientPlayer, TRACK_BY_SLUG } from "@/components/hall/useAmbientPlayer";
import { SLUG_TO_ICON } from "@/lib/ritual";

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

/**
 * 宗祠献祭面板
 *
 * 与纪念馆 WorshipPanel 的差异：宗祠是庄重场景，**不做一次性动效**，
 * 交互保持简洁——一键献祭、可选写祭文、积分供奉。
 * 唯一的音效是音乐类祭品起的环境音（在宗祠空间内循环），其余保持静默。
 * 深浅色由 props 的 tone 控制（宗祠装修可能是深色墙面）。
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

  // 环境音：宗祠仅在供奉音乐类祭品时播放，其余保持静默
  const { play: playAmbient, stop: stopAmbient, playing: ambientPlaying } = useAmbientPlayer();

  const dark = tone === "dark";

  async function submit(product: Item, message?: string) {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (product.qty <= 0) {
      setToast("该祭品已用尽，请先补充");
      setTimeout(() => setToast(""), 2800);
      return;
    }
    setBusy(product.slug);
    try {
      const res = await offerClanTribute(clanHallId, product.id, message);
      setToast(res.message);
      if (res.ok) {
        setMsgText("");
        setShowMsg(false);
        const track = TRACK_BY_SLUG[product.slug];
        if (track) playAmbient(track);
        router.refresh();
      }
    } catch {
      setToast("献祭失败，请稍后重试");
    } finally {
      setBusy("");
      setTimeout(() => setToast(""), 2800);
    }
  }

  async function handleClearAltar() {
    setBusy("__clear");
    const res = await clearClanAltar(clanHallId);
    setBusy("");
    stopAmbient();
    setToast(res.message);
    setTimeout(() => setToast(""), 2800);
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
  // 祭文礼器优先用父级传入的；回退到免费品（兼容未传的老调用点）
  // 注意：必须声明在 extraButtons 之前 —— 后者要按 slug 把祭文排除掉，
  // 否则会踩 TDZ（ReferenceError: Cannot access 'poemProduct' before initialization）。
  const poemProduct = poemProductProp ?? freeProducts.find((p) => p.slug === "free-poem") ?? null;

  /*
    「我的其它供品」第二行 —— **持有的免费 + 持有的收费都在这里**。
    第一行的 8 个位子是宗祠语义上最常用的（上香/献花/点烛…），但供品名录里还有
    风铃、河灯、烟花、音乐、祭文这类供品 —— 它们**用户已经持有**，却因为没有按钮而无处可献，
    这与「面板展示的是我买到的祭品」这条产品规则矛盾。
    因此把其余持有中的供品排在后面，既不挤占常用位，也不让东西烂在库存里。
    注意：
      - 必须同时收 **免费 + 收费**（收费靠 offerClanTribute，与免费同一条路径）；
      - 用尽的收费品**也留在这里**并灰显 —— 与纪念馆面板一致：
        「献祭后即被灰色，重新购买后即恢复点亮」，灰码还在用户才找得回它。
  */
  const extraButtons = [...freeProducts, ...paidProducts]
    .filter((p) => !ORDER.includes(p.slug) && p.slug !== poemProduct?.slug)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  /*
    积分供奉区：卡片式的那一排，只在**有可用余量**时出现。
    用尽的收费品不在这里重复 —— 它们已在上一行灰显（那里才是"我持有的"完整清单）。
  */
  const paidAvailable = paidProducts.filter((p) => p.qty > 0 && p.slug !== poemProduct?.slug);

  const btnCls = dark
    ? "flex flex-col items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-3 text-xs text-white/90 hover:bg-white/20 disabled:opacity-40"
    : "flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-3 text-xs text-stone-700 hover:border-accent-400 hover:bg-amber-50/50 disabled:opacity-40";

  /** 用尽的按钮灰显但不隐藏 —— 布局稳定，用户也知道东西还在、只是用完了 */
  const emptyCls = dark
    ? "flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-3 text-xs text-white/35"
    : "flex cursor-not-allowed flex-col items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-3 text-xs text-stone-400";

  /** 供台图标：直接查权威表，未知 slug 兜底 */
  const ICON_BY_SLUG = ICONS;

  return (
    <div className="mt-4">
      {/* 供台陈列：正在供奉的供品（持久，可手动撤供） */}
      {(altarItems.length > 0 || ambientPlaying) && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
            dark ? "border-white/15 bg-white/5" : "border-stone-200 bg-amber-50/40"
          }`}
        >
          <span className={`text-xs ${dark ? "text-white/70" : "text-stone-500"}`}>
            供台 · {altarItems.length} 件{ambientPlaying && " · ♪ 乐起"}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {altarItems.map((a) => (
              <span
                key={a.id}
                className="text-lg leading-none"
                title={a.name}
                data-altar-slug={a.slug}
              >
                {ICON_BY_SLUG[a.slug] ?? "🕊️"}
              </span>
            ))}
            {altarItems.length === 0 && (
              <span className={`text-xs ${dark ? "text-white/40" : "text-stone-400"}`}>
                供台空空
              </span>
            )}
          </span>
          {altarItems.length > 0 && (
            <button
              type="button"
              onClick={handleClearAltar}
              disabled={busy === "__clear"}
              className={`ml-auto rounded border px-2 py-0.5 text-xs transition disabled:opacity-50 ${
                dark
                  ? "border-white/25 text-white/80 hover:bg-white/10"
                  : "border-stone-300 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {busy === "__clear" ? "撤供中…" : "撤供"}
            </button>
          )}
        </div>
      )}

      <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${dark ? "text-white/70" : "text-stone-500"}`}>
        <span>免费祭品 · 一键献祭</span>
        <span>
          每次 +2 积分 · 每份用一次 · 每日补 3 份
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
              <span className="text-lg leading-none">{ICONS[p.slug] ?? "🕊️"}</span>
              <span>{LABELS[p.slug] ?? p.name}</span>
              <span
                className={
                  empty
                    ? "text-[10px] font-semibold opacity-70"
                    : p.qty <= 1
                      ? "text-[10px] font-semibold text-amber-600"
                      : "text-[10px] font-semibold text-green-600"
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
          <p className={`text-[11px] ${dark ? "text-white/50" : "text-stone-400"}`}>
            我的其它供品 · {extraButtons.filter((p) => p.qty > 0).length}/{extraButtons.length} 件可用
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {extraButtons.map((p) => {
              const empty = p.qty <= 0;
              return (
                <button
                  key={p.slug}
                  type="button"
                  /*
                    用尽态真的 disabled —— 与纪念馆面板同口径。
                    重新获得（购买 / 积分兑换 / 次日补货）后这里会自动回到可点。
                  */
                  disabled={busy === p.slug || empty}
                  onClick={() => submit(p)}
                  className={empty ? emptyCls : btnCls}
                  title={
                    empty
                      ? `献上${LABELS[p.slug] ?? p.name} · 已用尽`
                      : `献上${LABELS[p.slug] ?? p.name} · 余 ${p.qty} 份`
                  }
                >
                  <span className="text-lg leading-none">{ICONS[p.slug] ?? "🕊️"}</span>
                  <span>{LABELS[p.slug] ?? p.name}</span>
                  <span
                    className={
                      empty
                        ? "text-[10px] font-semibold opacity-70"
                        : p.qty <= 1
                          ? "text-[10px] font-semibold text-amber-600"
                          : "text-[10px] font-semibold text-green-600"
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

      {/* 祭文 / 留言 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!isLoggedIn) return router.push("/login");
            setShowMsg(true);
          }}
          className={
            dark
              ? "rounded-md border border-white/25 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
              : "rounded-md border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
          }
        >
          写一段祭文 · 留言追思
        </button>
      </div>

      {/*
        积分供奉：**只列我已持有的**（qty > 0）。
        改造前这里固定渲染前 4 个收费品，没兑换过的会显示「需兑换」，
        相当于在"我持有的供品"面板里塞了 4 个不能点的广告位 —— 与产品规则冲突。
        补货入口统一收到面板底部的「去商城补充供品 →」。
      */}
      {paidAvailable.length > 0 && (
        <div className="mt-4">
          <p className={`text-xs ${dark ? "text-white/70" : "text-stone-500"}`}>
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
                    ? "rounded-md border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-xs text-amber-100 hover:bg-amber-400/25 disabled:opacity-40"
                    : "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-40"
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

      {/* 补货引导：面板只列持有的，那"没得用"时就得有个明确的去处 */}
      <p className={`mt-3 text-[11px] ${dark ? "text-white/50" : "text-stone-400"}`}>
        面板只展示我持有的供品，用尽后灰显 ·
        <a href="/mall" className="ml-1 underline hover:no-underline">
          去商城补充供品 →
        </a>
      </p>

      {/* 祭文弹窗 */}
      {showMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-brand-900">祭文 · 留言追思</h3>
            <p className="mt-1 text-xs text-brand-400">写下缅怀与祈愿，将随祭祀记录一并留存（200 字以内）</p>
            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              rows={4}
              maxLength={200}
              placeholder="伏惟尚飨……"
              className="mt-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="mt-1 text-right text-xs text-brand-300">{msgText.length}/200</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMsg(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-brand-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy !== "" || !msgText.trim() || !poemProduct || poemProduct.qty <= 0}
                onClick={() => poemProduct && submit(poemProduct, msgText)}
                className="rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
              >
                献上
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提示 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-900/90 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
