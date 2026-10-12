"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  DECOR_CATEGORIES,
  DEFAULT_DECOR,
  GRANTED_TEMPLATE_PARTS,
  HallSlots,
  MAX_ORNAMENTS,
  TIER_LABEL,
  decorItem,
  isKeyActive,
  slotMainValue,
  type DecorCategory,
  type DecorItem,
  type DecorSlot,
  type DecorTemplate,
  type HallDecor,
} from "@/lib/hall-decor";
import { skinOf, withDark } from "@/lib/decor-skin";
import { fubFromFen, fubOnly } from "@/lib/fortune";
import {
  resetDecor,
  saveDecor,
  unlockDecor,
} from "@/app/console/halls/[id]/actions";
import DecorSpacePreview from "@/components/decor/DecorSpacePreview";
import DecorFullPreview from "@/components/decor/DecorFullPreview";
import DecorStudioGuide from "@/components/console/DecorStudioGuide";
import DecorTierLadder from "@/components/console/DecorTierLadder";

type Result = { ok: boolean; message?: string; needUnlock?: { kind: string; id: string; slot?: string; points: number } };

/**
 * 五个槽位的白名单。
 *
 * ⚠️ 必须定义在**文件顶部**，不能放在下面用它的函数旁边 ——
 *    `const` 有 TDZ，组件体内 `contentKey()` 会用到它；
 *    若声明在文件靠后位置，只要求值顺序一变就是运行时 `Cannot access before initialization`。
 *    这与 CLAN_KITS 那次崩溃是同一类问题（值必须在使用点之前、且在正确的模块里）。
 */
const SLOT_KEYS: DecorSlot[] = ["wall", "floor", "ornament", "frame", "font"];

/** 挂饰「无陈设」素材 id（两端各一）：选中它 = 清空到一件都不挂 */
const NONE_ORNAMENTS = new Set(["orn-none", "clan-orn-none"]);

/** 装修工坊所需的动作集合（默认 = 纪念馆，宗祠可传入自己的实现） */
export type DecorActions = {
  /**
   * 保存整份装修草稿 —— 唯一的内容写入口（「装修完了点保存即完成装修」）。
   *
   * ⚠️ 与下面三个"即时生效"的动作语义不同，别混：
   *    saveDecor*  = 装修内容（templateId/slots），走草稿，点保存才落库
   *    unlockDecor = **购买**（花积分/钱），必须即时落库
   *    resetDecor  = 清空装修内容，也是即时（用户明确点的"恢复默认"）
   */
  saveDecor: (fd: FormData) => Promise<Result>;
  unlockDecor: (fd: FormData) => Promise<Result>;
  resetDecor: (fd: FormData) => Promise<Result>;
};

const HALL_ACTIONS: DecorActions = {
  saveDecor: saveDecor as unknown as DecorActions["saveDecor"],
  unlockDecor: unlockDecor as unknown as DecorActions["unlockDecor"],
  resetDecor: resetDecor as unknown as DecorActions["resetDecor"],
};

export type DecorStudioProps = {
  hallId: string;
  decor: HallDecor;
  isPremium: boolean;
  userPoints: number;
  /** 素材分类目录（含 items）。默认 = 纪念馆目录 */
  categories?: DecorCategoryGroup[];
  /** 各槽位名称查表。默认 = 纪念馆目录 */
  slotLabels?: Record<DecorSlot, Record<string, string>>;
  /** 恢复默认时的槽位取值。默认 = 纪念馆默认搭配 */
  defaultSlots?: HallSlots;
  /** 提交动作。默认 = 纪念馆 actions */
  actions?: DecorActions;
  /** premium 档素材的解锁入口。默认 = /suites（装修方案目录）；见下方 default 处注释 */
  premiumHref?: string;
  /** 标题 */
  title?: string;
  /** 说明文案 */
  hint?: string;
  /** 存量字段名：提交时作为 hallId 的键名（宗祠传 clanHallId 之外的同一 key 亦可） */
  idField?: string;
  /** 公网馆页地址（保存完成后给"去馆页看看"的入口） */
  hallHref?: string;
  /** 完整装修指引页地址 */
  guideHref?: string;
  /**
   * 自定义素材缩略图（可选）。
   *
   * 纪念馆传空 → 沿用 emoji/色块预览；宗祠传入 → 用**真实建筑构件**的微缩图，
   * 让工坊里的每个挂饰都直接呈现"装上去长什么样"。
   * 返回 null 时回退到默认 emoji 预览。
   */
  renderThumb?: (
    entry: DecorStudioEntry,
    slot: DecorSlot,
  ) => ReactNode;
  /**
   * 当前方案是否算「深色底」（整页预览用）。
   *
   * ⚠️ 必须由**调用方**传，不能由工坊自己猜：
   *    公页的深色判定是"并集"（`skin.dark ||` 页面自己的深色列表），
   *    那份列表只有页面知道（曾经是 `onDarkWall` / `CLAN_DARK_WALLS`）。
   *    工坊自己只按 `skin.dark` 猜，会在边界素材上与公页打架 ——
   *    这正是阶段 4 那个真 bug 的成因（判定源分叉）。
   *    不传则退化为"只看 skin.dark"，预览可能比公页浅一档。
   */
  darkDecor?: boolean;
  /** 堂号（整页预览的占位标题；不传用通用文案。预览里绝不出现逝者照片） */
  hallName?: string;
};

/** 分类分组（items 元素类型放宽到结构最小集，兼容宗祠素材目录） */
export type DecorCategoryGroup = {
  key: DecorCategory;
  label: string;
  hint: string;
  items: readonly DecorStudioEntry[];
};

/**
 * 套件应用用的槽位映射（Partial，因为套件通常只覆盖部分槽位）。
 * ⚠️ ornament 槽支持 `string | string[]`：阶段 9 起模板把 `slots.ornament`
 * 改成了数组（单一真相源），模板/套件流入工坊时也会带数组。
 */
export type DecorKitSlots = Partial<Omit<Record<DecorSlot, string>, "ornament">> & {
  ornament?: string | string[];
};

/** 装修工坊只关心素材的展示字段与档位，不关心渲染细节 */
export type DecorStudioEntry = {
  id: string;
  name: string;
  desc: string;
  tier: DecorItem["tier"];
  points?: number;
  /** 货币价（分）。付费解锁档位用它显示"¥N / N 积分" */
  priceFen?: number;
  tags?: string[];
  /** 模板/套件的槽位覆盖（Partial：套件通常只换部分槽位） */
  slots?: DecorKitSlots;
  /** 套件包含的素材（仅 kit 有） */
  includes?: string[];
  /**
   * 整店套餐的**权威槽位映射**（仅带 wall/floor 的套件有）。
   *
   * ⚠️ 与 `includes` 的分工勿混（见 lib/hall-decor.ts 的 DecorKit 注释）：
   *    `includes` = "买到手的零件"（落 `unlocked`，是**权益**）
   *    `applies`  = "点一下落到哪五个槽位"（只改 `slots`，是**方案**）
   * 早先 `kitSlots()` 只读 `includes`、靠 id 前缀猜槽位 —— 当时三个套餐的命名
   * 恰好规范所以推对了，但**正确性建立在命名约定这个巧合上**：一旦某件素材
   * 命名不带规范前缀、或 applies 与 includes 分叉，就会有槽位静默不换、不报错。
   * 现在 applies 优先、前缀只作旧套件的兜底。
   */
  applies?: DecorKitSlots;
  /**
   * 结构档位（仅模板有；来自 lib/decor-3d.ts 的 StructureTier）。
   * 档次阶梯据此判定"当前在哪一档"，与价格档位（tier）是两个正交维度。
   */
  structure?: string;
  /** 全页换肤增量（仅模板有；来自 lib/decor-skin.ts） */
  skin?: DecorTemplate["skin"];
  /**
   * 空间形态（仅模板有；来自 lib/decor-3d.ts 的 SpaceKind）。
   * 全屏预览据此决定画什么样的 3D 空间 —— 与馆页用的是同一个字段，
   * 所以"预览里看到的"就是"保存后馆页得到的"。
   */
  space?: string;
  preview: { background?: string; color?: string; border?: string; icon?: string; fontFamily?: string };
};

/**
 * 分 → 福币显示（1 福币 = 1 元）。
 *
 * ⚠️ 这里**委托 `lib/fortune.ts` 的 `fubFromFen`/`fubOnly`**，不再自己算 ——
 * 早先是手写 `fen / 100` + `toFixed(2)`，与 `fubFromFen` 是**同一个事实的两个判据**：
 *   - 手写版输出 "1.50 福币"（两位小数），`fubOnly` 输出 "1.5 福币"（一位）；
 *   - 手写版精度是 0.01 元，`fubFromFen` 是 0.1 元 —— 两边对同一件素材可能给出不同数字。
 * 本仓库反复踩这个病（withDark / data-page-skin / premiumUntil / findTemplate），
 * 福币价必须**全平台一个入口**。
 */
function yuan(fen?: number) {
  if (!fen || fen <= 0) return "";
  return fubOnly(fubFromFen(fen));
}

/**
 * 档位徽章。
 *
 * ⚠️ `buyout` 必须与 `points` 分开显示 —— 用户口径是「付费是指可以积分兑换也可以用货币支付」，
 *    所以同一件素材**两种支付方式都可用**，徽章要把两条路都亮出来，
 *    否则用户会以为"只能积分"或"只能花钱"。
 */
function tierBadge(tier: DecorItem["tier"], locked: boolean, points?: number, priceFen?: number) {
  if (tier === "free") {
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">建馆赠品</span>;
  }
  if (tier === "premium") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
        {locked ? "需高级订阅" : "高级订阅"}
      </span>
    );
  }
  // points / buyout：两种支付方式并列
  const money = yuan(priceFen);
  /*
    ⚠️ 已解锁时**也要把价格显示出来**，不能只写"已解锁"。

    早先在 `locked === false` 时直接返回"已解锁"，价格被整个丢掉 ——
    后果有二：
      ① 用户看不到"这个东西值多少钱"，也不知道自己省了多少/买了什么；
      ② 模板卡与套件卡**全都没有价签**，档次阶梯的"¥5–15 / ¥39–99"
         与素材墙对不上号（阶梯说了价格区间，卡片却一片"已解锁"）。

    现在统一成「¥N · 已解锁」：价格是**信息**，解锁状态是**状态**，两者不冲突。
    付费模板必然有 priceFen，所以卡片上一定看得到 ¥。
  */
  const pay = [points ? `${points} 积分` : "", money].filter(Boolean).join(" / ");
  const label = locked ? pay || "需解锁" : [money, "已解锁"].filter(Boolean).join(" · ");
  return (
    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">{label}</span>
  );
}

export default function DecorStudio({
  hallId,
  decor,
  isPremium,
  userPoints,
  categories = DECOR_CATEGORIES,
  slotLabels,
  defaultSlots = DEFAULT_DECOR,
  actions = HALL_ACTIONS,
  /**
   * 解锁 premium 档素材的跳转目标。
   *
   * ⚠️ 别再指回 `/mall/premium-storage`（2026-10 已下架）：那是**容量商品**
   * （老定义 ¥99/年 · 50GB），与「解锁高级订阅素材」根本不是同一件事 ——
   * 用户点「开通高级订阅解锁」却落到卖存储容量的页面，是错配。
   * 装修 premium 档的真实解锁入口在 /suites（三层九档装修方案目录）。
   */
  premiumHref = "/suites",
  title = "空间装修工坊",
  hint = "按自己的心意布置纪念空间。免费的素材足够庄重，精致的素材可积分兑换或开通高级订阅直接使用。",
  idField = "hallId",
  hallHref,
  guideHref = "/guide/decor",
  renderThumb,
  darkDecor = false,
  hallName,
}: DecorStudioProps) {
  const [tab, setTab] = useState<string>("template");
  const [current, setCurrent] = useState<HallDecor>(decor);
  const [msg, setMsg] = useState<Result | null>(null);
  const [busyId, setBusyId] = useState("");
  const [, startTransition] = useTransition();
  /** 任一异步动作进行中 → 禁用按钮，防止并发点击打乱草稿 */
  const busy = busyId !== "";
  /*
    ===== 草稿（「装修完了点保存即完成装修」）=====

    `current` 是**画面上看到的**（含未保存改动），`savedSnapshot` 是**库里的**。
    两者不一致 = 有未保存的改动，顶部据此显示提示条。

    为什么用"快照对比"而不是一个 boolean `dirty`：
    boolean 要求每个改动点都记得置位、每个还原点都记得清位，
    漏一处就出现"改了但提示没出现"（用户以为已保存，刷新后才发现丢了）。
    快照对比是**声明式**的 —— 只要 `current` 回到快照值，dirty 自动消失，
    哪怕中间绕了"改A→改B→改回A"也正确。
  */
  const [savedSnapshot, setSavedSnapshot] = useState<HallDecor>(decor);
  const [justSaved, setJustSaved] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  /*
    对比视图开关（阶段 1 · 「第一眼证据」）。

    用户的原话是「装修系统必须具备良好的体验感」，而体验感的第一要素是
    **让落差可见** —— 如果用户看不出"装修过的"和"没装修的"差在哪，
    他就没有装修的动机，整个收益路径也就断了。

    所以工坊顶部默认并排两屏：左「未装修（素白基准）」、右「当前方案」。
    左屏**恒等于 DEFAULT（未装修）**，不随用户点击变化 ——
    这里刻意用 `defaultSlots` 而不是快照：
      · 用快照会变成"上次保存 vs 现在"，用户看不到"没装修"的锚点；
      · 用默认槽位才是用户第一次进馆看到的样子（= 素白 + 无结构装饰）。
    左屏的 spaceKind 固定 "classic"：未装修的馆没有模板，空间骨架就是通用厅堂
    （这与 `DecorSpacePreview` 里"templateId 为空 → classic"的口径一致）。

    允许关闭（窄屏/老用户嫌挤），但默认开 —— 首屏证据是阶段 1 的目标。
  */
  const [compare, setCompare] = useState(true);
  /*
    整店套餐应用后的**瞬时反馈**（1.5s 后自动消失）。

    为什么需要：整店套餐一次改五个槽位，画面"唰"地全变了，
    用户很容易没意识到"刚才那一下干了什么"。给右屏一圈高亮 + 角标，
    让"整套已换"这件事有个明确的落点。

    ⚠️ 这是**纯加法**：不改变对比视图语义（左屏仍恒为"未装修素白基准"）。
       改成"应用前 vs 应用后"会让新用户看不到落差 —— 那是阶段 1 的核心目标，
       不能为了这个反馈把它换掉。
  */
  const [kitFlash, setKitFlash] = useState(false);

  /** 只比较"装修内容"，权益字段（unlocked/granted）不参与 dirty 判定 */
  function contentKey(d: HallDecor) {
    return JSON.stringify({
      t: d.templateId ?? "",
      s: SLOT_KEYS.map((k) => d.slots[k]),
      // 多挂饰清单（slots.ornament 数组）参与 dirty 判定 ——
      // 漏了会出现"加了第二件但保存按钮不亮"
      o: d.slots.ornament,
    });
  }
  const dirty = contentKey(current) !== contentKey(savedSnapshot);

  const unlocked = current.unlocked ?? [];
  const granted = current.granted ?? [];
  /*
    权益租期表（2026-10 租期制）。
    ⚠️ 客户端镜像的租期判定**必须 import 服务端同一个 isKeyActive**，
      不许手写 `new Date(...) > new Date()` —— 两边各写一份日期比较，
      就是"同一事实两个判据"的老病（工坊说能用、公页已回退）。
      isKeyActive 是纯函数（hall-decor 无服务端依赖），客户端可直接用。
  */
  const entitlements = current.entitlements;
  /*
    赠品模板用到的零件：这些在工坊里一律显示为可用（不可再购买）。
    用 GRANTED_TEMPLATE_PARTS 反查而不是把零件塞进 unlocked ——
    unlocked 会被「恢复默认」与档位调整重写，塞进去迟早被吃掉。
  */
  const grantedParts = granted.flatMap((tid) => GRANTED_TEMPLATE_PARTS[tid] ?? []);

  const SLOT_LABEL_LOOKUP: Record<DecorSlot, Record<string, string>> = slotLabels ?? buildSlotLabels(categories);

  /**
   * 购买（积分兑换）—— **即时落库**，不走草稿。
   *
   * 花钱/花积分是消费行为，做成草稿意味着"可以点一堆再关掉页面白嫖预览"。
   * 权益必须即时生效；它生效之后，用户**还得点保存**才真的换上，
   * 这两步是分开的（买 ≠ 用），提示条会说明。
   */
  function onUnlock(kind: "item" | "template" | "kit", id: string) {
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set("kind", kind);
    fd.set("id", id);
    setBusyId(`unlock-${id}`);
    startTransition(async () => {
      const res = (await actions.unlockDecor(fd)) as Result;
      setBusyId("");
      if (res.ok) {
        /*
          本地镜像的键形态必须与服务端写库的**完全一致**：
            template → `tpl:<id>`   kit → `kit:<id>`   item → `buy:<id>`
          早先这里对 kit/item 都 push 裸 id —— isKitLocked 查的是 `kit:<id>`，
          裸 id 永远不命中，买完套件 UI 仍显示「兑换」直到刷新（再点会得到
          幂等提示"已解锁"，用户观感是"点了没反应"）。isItemLocked 因兼容
          裸 id 侥幸没暴露，一并对齐。
          （服务端还会写 kit includes 的 `buy:` 键，本地不模拟 ——
          `kit:` 键命中已足够解锁判定，刷新后自然拿到完整数据。）
        */
        const next = {
          ...current,
          unlocked: [
            ...(current.unlocked ?? []),
            kind === "template" ? `tpl:${id}` : kind === "kit" ? `kit:${id}` : `buy:${id}`,
          ],
        };
        setCurrent(next);
        /*
          购买只改权益、不改装修内容，所以快照也要跟着推进 unlocked，
          否则 dirty 会因为"权益变了"而永远为真（`contentKey` 不看权益，
          但 `setSavedSnapshot` 存的是整个对象，保持同步更省心）。
        */
        setSavedSnapshot((s) => ({ ...s, unlocked: next.unlocked }));
      }
      setMsg(res);
    });
  }

  /** 选模板：只改本地草稿（含该模板的全套 slots；挂饰清单重置为该模板预设的多件陈设） */
  function onTemplate(tpl: DecorStudioEntry) {
    setMsg(null);
    setJustSaved(false);
    setCurrent((c) => {
      // 模板 slots.ornament 是 string[]（单一真相源），这里显式归一成 string[]
      // 以免与 tpl.slots 的 string | string[] 联合类型冲突
      const tplOrn = tpl.slots?.ornament;
      const ornament: string[] =
        tplOrn == null
          ? c.slots.ornament
          : Array.isArray(tplOrn)
            ? tplOrn
            : [tplOrn];
      return {
        ...c,
        templateId: tpl.id,
        slots: { ...c.slots, ...(tpl.slots ?? {}), ornament },
      };
    });
  }

  /** 选单件素材：只改本地草稿，并脱离整套模板 */
  function onItem(slot: DecorSlot, item: DecorStudioEntry) {
    setMsg(null);
    setJustSaved(false);
    if (slot === "ornament") {
      /*
        多挂饰（阶段 9）：挂饰分类是**多选 toggle**，不再是"点一下替换"。
        单一真相源是 current.slots.ornament（string[]）；"无陈设"素材
        （orn-none）只是清单里的一件，不用空数组表达。
        不变量：清单非空、首件 = 主陈设、长度 ≤ MAX_ORNAMENTS。
      */
      const list: string[] = [...current.slots.ornament];
      // 点"无陈设"：整个清单清空成只挂"无"
      if (NONE_ORNAMENTS.has(item.id)) {
        if (list.length === 1 && list[0] === item.id) return;
        setCurrent({
          ...current,
          templateId: undefined,
          slots: { ...current.slots, ornament: [item.id] },
        });
        return;
      }
      if (list.includes(item.id)) {
        if (list.length === 1) {
          setMsg({ ok: false, message: "挂饰至少保留一件；想清空陈设请选「无陈设」素材。" });
          return;
        }
        const next = list.filter((x) => x !== item.id);
        setCurrent({
          ...current,
          templateId: undefined,
          slots: { ...current.slots, ornament: next },
        });
        return;
      }
      if (list.length >= MAX_ORNAMENTS) {
        setMsg({ ok: false, message: `最多同时陈设 ${MAX_ORNAMENTS} 件挂饰，先取消一件再试。` });
        return;
      }
      // 清单里若只剩"无"，加新件时把"无"挤掉
      const base = list.filter((x) => !NONE_ORNAMENTS.has(x));
      const next = [...base, item.id];
      setCurrent({
        ...current,
        templateId: undefined,
        slots: { ...current.slots, ornament: next },
      });
      return;
    }
    setCurrent((c) => ({
      ...c,
      // 手动改过任一槽位后就不再算"整套模板"（与 setDecorSlot 的旧语义一致）
      templateId: undefined,
      slots: { ...c.slots, [slot]: item.id },
    }));
  }

  /**
   * 恢复默认 —— **即时落库**。
   *
   * 用户点它就是要"清空重来"，此时若还留在草稿里，用户会困惑
   * "我点了恢复默认，怎么预览变了但一刷新又回来了"。
   * 所以它直接写库，并把草稿与快照一起重置到默认值。
   */
  function onReset() {
    const fd = new FormData();
    fd.set(idField, hallId);
    setBusyId("reset");
    startTransition(async () => {
      const res = await actions.resetDecor(fd);
      setBusyId("");
      if (res.ok) {
        const next: HallDecor = {
          templateId: undefined,
          slots: { ...defaultSlots },
          unlocked: current.unlocked,
          granted: current.granted,
        };
        setCurrent(next);
        setSavedSnapshot(next);
        setJustSaved(false);
      }
      setMsg(res);
    });
  }

  /** 放弃未保存的改动 → 回到库里那份 */
  function onDiscard() {
    setCurrent(savedSnapshot);
    setMsg(null);
    setJustSaved(false);
  }

  /**
   * 保存并完成装修 —— 整份草稿一次提交。
   *
   * 提交的是 `{templateId, slots}`；`unlocked`/`granted` **不提交**，
   * 服务端一律沿用库里的原值（权益不能由前端草稿决定）。
   */
  function onSave() {
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set(
      "draft",
      JSON.stringify({
        templateId: current.templateId,
        slots: current.slots,
      }),
    );
    setBusyId("save");
    startTransition(async () => {
      const res = (await actions.saveDecor(fd)) as Result;
      setBusyId("");
      if (res.ok) {
        setSavedSnapshot(current);
        setJustSaved(true);
      }
      setMsg(res);
    });
  }

  /**
   * 素材是否对本馆锁定。
   *
   * 判定顺序与 lib/hall-decor.ts 的 isUnlocked() 必须**一致**（这里是客户端镜像）：
   *   free → 可用；高级订阅期内 → 全可用；赠品零件 → 永久可用；
   *   否则看 unlocked **且租期未过**（2026-10 租期制，isKeyActive 缺条目 = 永久）。
   *
   * 早先这里只写 `tier === "free"` 就放行、只看 `unlocked.includes(item.id)` 判锁，
   * 于是**赠品模板的零件在工坊里显示为"锁着"** —— 明明装修方案里正在用，
   * 工坊却让用户再买一次。这正是"甲方案"要防的那件事。
   */
  function isItemLocked(item: DecorStudioEntry) {
    if (isPremium) return false;
    if (item.tier === "free") return false;
    if (grantedParts.includes(item.id)) return false;
    const has = unlocked.includes(item.id) || unlocked.includes(`buy:${item.id}`);
    return !has || !isKeyActive(`buy:${item.id}`, entitlements);
  }
  function isTemplateLocked(tpl: DecorStudioEntry) {
    if (isPremium) return false;
    if (tpl.tier === "free") return false;
    // 赠品模板：建馆时发过，永久可用，不该再让用户掏钱
    if (granted.includes(tpl.id)) return false;
    const has = unlocked.includes(`tpl:${tpl.id}`);
    return !has || !isKeyActive(`tpl:${tpl.id}`, entitlements);
  }

  /** 套件是否可应用（套件本身不落库，落地的是它包含的素材） */
  function isKitLocked(kit: DecorStudioEntry) {
    if (isPremium) return false;
    if (kit.tier === "free") return false;
    if (unlocked.includes(`kit:${kit.id}`)) {
      // 曾购：租期已过 = 锁定（续费恢复）；缺条目 = 永久（存量兼容）
      return !isKeyActive(`kit:${kit.id}`, entitlements);
    }
    // 兼容：套件里的素材全都能用，就算作已拥有（例如用户单件买齐了）
    // ——"都能用"含租期判定，过期零件不算数
    const inc = kit.includes ?? [];
    if (inc.length > 0 && inc.every((id) => unlocked.includes(`buy:${id}`))) {
      return !inc.every((id) => isKeyActive(`buy:${id}`, entitlements));
    }
    return true;
  }

  /**
   * 该键是否"曾购但租期已过" —— 用于把按钮文案从「兑换」切成「续费」。
   * 与锁定判定同源（isKeyActive），只多一个"曾在 unlocked"的前提。
   */
  function isKeyExpired(key: string) {
    return unlocked.includes(key) && !isKeyActive(key, entitlements);
  }

  /**
   * 租期到期日（yyyy-MM-dd）。永久持有（缺条目 / null）或未曾购买 → undefined。
   * 只用于**显示**（"有效期至 …"）；判定一律走上面那两个函数，不解析这里的字符串。
   */
  function leaseUntil(key: string): string | undefined {
    const v = entitlements?.[key];
    return typeof v === "string" && v ? v.slice(0, 10) : undefined;
  }

  /**
   * 应用套件（两种粒度，行为不同）。
   *
   * ===== 普通套件（无 applies / 不含墙地）=====
   * 只换挂饰/相框/字体，**不动壁纸与地纹** —— 这是套件最初存在的意义：
   * 用户认真挑过墙与地之后，不该被一次点击覆盖掉。
   *
   * ===== 整店套餐（applies 含 wall 或 floor）=====
   * 「一键换整套」，**连墙带地一起换**。用户口径是"我懒得挑，给我一套配好的"。
   *
   * ⚠️ 整店套餐**保留 `templateId`**（不置空），这是刻意的：
   *    `templateId` → `currentTemplate.space` → `currentSpaceKind`，而
   *    `DecorSpacePreview` **只认模板的 space**、不认 `kit.structure`。
   *    若这里把 templateId 置空，用户花 ¥59 买「金殿整装包」应用后，
   *    空间骨架会退回 classic（2 柱 1 枋）—— 观感是"越买越朴素"，
   *    恰好与"付费升级"的承诺相反。
   *    整店套餐是「五槽内容包」，不是「空间形态包」：
   *    换内容，不改骨架；想换骨架请去挑模板。
   *
   * 改成草稿模式后这里**简单了很多**：以前要逐个槽位发 N 次 Server Action
   * （还得处理"第 3 条失败了前 2 条已经写进去"的半成品状态），
   * 现在只改本地对象，由「保存」一次性提交 —— 天然原子。
   */
  function onKit(kit: DecorStudioEntry) {
    const slots = kitSlots(kit);
    if (Object.keys(slots).length === 0) return;
    setMsg(null);
    setJustSaved(false);
    setCurrent((c) => {
      // 套件带了挂饰 → 挂饰清单重置为该挂饰一件（与模板应用同口径）
      const kitOrn = Array.isArray(slots.ornament)
        ? slots.ornament
        : slots.ornament
          ? [slots.ornament]
          : [];
      const nextOrn = kitOrn.length > 0 ? kitOrn : c.slots.ornament;
      if (isFullStoreKit(kit)) {
        // 整店套餐：连墙地带一套全换，templateId 保留（见上方说明）
        setKitFlash(true);
        window.setTimeout(() => setKitFlash(false), 1500);
        return { ...c, slots: { ...c.slots, ...slots, ornament: nextOrn } };
      }
      // 普通套件：只换挂饰/相框/字体，且不再算"整套模板"（原行为）
      // 反馈与整店套餐同款 ring —— 应用动作必须有可见确认，
      // 否则"换了但看不出来"（挂饰本来就一样时）观感等于按钮失灵。
      setKitFlash(true);
      window.setTimeout(() => setKitFlash(false), 1500);
      return { ...c, templateId: undefined, slots: { ...c.slots, ...slots, ornament: nextOrn } };
    });
  }

  /** 套件的 includes 要映射到槽位：素材 id 前缀决定它属于哪个槽位 */
  function kitSlots(kit: DecorStudioEntry): DecorKitSlots {
    /*
      ⚠️ applies 优先，前缀推断只给**旧套件**兜底。

      顺序不能反 —— `applies` 是数据层显式声明的"点一下落到哪五个槽位"，
      `includes` 是"买到手的零件"（权益），两者语义不同。
      早先只读 includes 靠 id 前缀猜，是**碰巧推对**（见 DecorStudioEntry.applies 注释）：
      正确性挂在"素材 id 命名规范"这个约定上，坏起来是静默的（某槽位没换、不报错）。
    */
    if (kit.applies && Object.keys(kit.applies).length > 0) {
      return { ...kit.applies };
    }
    const out: DecorKitSlots = {};
    for (const id of kit.includes ?? []) {
      const slot = SLOT_OF_PREFIX(id);
      if (!slot) continue;
      if (slot === "ornament") {
        /*
          阶段 9：挂饰是多选清单，套件 includes 的**全部**挂饰都装上。
          旧写法 `out[slot] = id` 互相覆盖 —— 「香火供奉套件」含香炉+供桌+灯笼
          3 件挂饰，应用后只剩最后 1 件灯笼；用户当前挂饰恰好已是灯笼时
          （很常见），点击 = 彻底 no-op，观感就是"点了没反应"（用户实测报障）。
          反向验证已做：改回覆盖写法 → §2b 声明层断言精确变红，再还原。
        */
        const prev = out.ornament;
        out.ornament = Array.isArray(prev) ? [...prev, id] : prev ? [prev, id] : [id];
        continue;
      }
      out[slot] = id;
    }
    return out;
  }

  /** 套件的展示名（"当前装修方案"摘要与调试用） */

  const activeCat = categories.find((c) => c.key === tab) ?? categories[0];

  /*
    当前草稿的空间形态。
    只从**模板**的 space 推出来（模板在 categories 的 template 分类里，
    也就是这份 categories 自带的模板表）—— 不去按挂饰猜，
    否则预览的形态会与保存后馆页渲染的形态不一致（馆页只看模板的 space）。
  */
  const currentTemplate = (categories.find((c) => c.key === "template")?.items as
    | DecorStudioEntry[]
    | undefined)?.find((t) => t.id === current.templateId);
  const currentSpaceKind = currentTemplate?.space ?? "classic";

  /*
    整页预览用的皮肤（阶段 5）。

    ⚠️ 必须 `skinOf` + `withDark` 两步走，**与公页完全同口径**：

    公页的写法是 `const pageSkin = withDark(skin, dark)`，其中 `dark` 是
    "并集判定"（skin.dark || 页面自己的深色列表）。工坊里没有公页那份列表，
    所以由**调用方**通过 prop `darkDecor` 传进来 —— 层的推断看不到它。
    若这里偷懒只传 `skinOf(...)`，深色墙 + 浅色卡会在预览里文案看不见，
    正是阶段 4 抓到过的那个真 bug（宗祠「字辈诗 · 派语」白字压浅米卡）。

    `sources.items` 用当前草稿的五槽素材；模板从 categories 的 template
    分类里取（与 `currentTemplate` 同源，避免两处查表出现分歧）。
  */
  const previewDark = skinOf(current, {}).dark || darkDecor;
  const previewSkin = withDark(
    skinOf(current, {      items: {
        wall: current.slots.wall ? decorItem("wall", current) : undefined,
        floor: current.slots.floor ? decorItem("floor", current) : undefined,
        ornament: current.slots.ornament ? decorItem("ornament", current) : undefined,
        frame: current.slots.frame ? decorItem("frame", current) : undefined,
        font: current.slots.font ? decorItem("font", current) : undefined,
      },
      template: currentTemplate
        ? { id: currentTemplate.id, skin: currentTemplate.skin }
        : undefined,
    }),
    previewDark,
  );

  /*
    「未装修」基准方案（对比视图的左屏）。

    ⚠️ 三处刻意的取舍，别"顺手优化"掉：
      1. **不含 templateId** —— 未装修的馆没有模板，所以 spaceKind 走 classic。
         若让它继承当前 templateId，左屏会跟着右屏一起变豪华，
         对比就废了（这是最容易犯的错：看起来"两屏一样"像渲染坏了，
         其实是基准被污染）。
      2. **不含 unlocked/granted** —— 左屏只表达"画面长什么样"，
         权益字段对渲染无影响，带上反而让对象每次重建、触发多余重算。
      3. **用 defaultSlots**（宗祠传 CLAN_DEFAULT_DECOR）而不是当前槽位，
         才是"没花钱的样子"的准确口径。
  */
  const baselineDecor: HallDecor = {
    templateId: undefined,
    slots: { ...defaultSlots },
  };

  /*
    档次阶梯数据（阶段 5）。

    ===== 为什么用「价格档」而不是「结构档位」 =====

    直觉上该用 `structure`（结构档位），但实测发现它会给出**反直觉**的结论：
      · `starfield` 空间的 `structureTier` 是 **none**（"星河"是"无建筑构件"形态，
        这是渲染层刻意的定义 —— 见 lib/decor-3d.ts 的形态表）；
      · 于是「星河长明」（¥20 高级订阅、最贵的模板之一）会被算成**最朴素档**。
    结构档位衡量的是"**画了多少建筑构件**"，不是"用户花了多少钱、看着多华贵"。
    用户理解的"档次"是后者 —— 所以这里用**价格档**。

    ===== 四档口径来自阶段 3（与 verify-decor-pricing-v2.mjs 一致） =====
      免费 ¥0 / 入门 ¥5–15 / 中档 ¥15–39 / 豪华 ¥39–99
    区间**写死**，不按素材价现算 —— 现算会随素材增减抖动，
    用户下次进来看到"豪华档 ¥39–99"变成"¥45–99"，像是偷偷涨价。

    ⚠️ `priceFen` 的单位是**分**，必须 /100 再用 ——
       直接把 fen 当元用会让所有模板都落进"豪华档"（阶段 4 踩过这个坑）。
    而下面这张表的 `min`/`max` 用的是**元**（与 `priceYuan()` 同口径），
    两个单位在同一个文件里并存，是本文件最容易出错的地方，见下。
  */
  /*
    ⚠️ `min` / `max` 的单位是**元**，与 `priceYuan()` 的返回值同口径。

    这个坑在本文件里踩了**两次**（第二次才找到根因）：
      ① 判「当前档」时手写 `curPrice < 1500 ? "entry" : ...` ——
         `priceYuan()` 是元、阈值是分，¥99 恒落"入门档"；
      ② 修了 ① 之后**统计各档套数那处没改** —— `y >= d.min` 同样是"元比分"，
         于是"可选套数"长期显示 `entry:0 mid:0 lux:0`（只有 `y === 0` 的免费档是对的）。
    根因是同一个：**阈值字面量跟着隔壁那处的单位写**。
    所以现在把区间也统一成元，且 `range` 文案与 `min/max` 严格一致 ——
    改一处时必须改另一处，肉眼就能对上号。
  */
  const TIER_BANDS = [
    { key: "free" as const, label: "免费", range: "0 福币", min: 0, max: 0 },
    { key: "entry" as const, label: "入门", range: "5–15 福币", min: 5, max: 15 },
    { key: "mid" as const, label: "中档", range: "15–39 福币", min: 15, max: 39 },
    { key: "lux" as const, label: "豪华", range: "39–99 福币", min: 39, max: 99 },
  ];
  const tierItems = (categories.find((c) => c.key === "template")?.items ??
    []) as DecorStudioEntry[];
  /** 模板的货币价（**元**）。分 → 元，别当元用（见上方注释） */
  const priceYuan = (t: DecorStudioEntry) => (t.priceFen ?? t.points ?? 0) / 100;
  const tierRungs = TIER_BANDS.map((d) => {
    const count = tierItems.filter((t) => {
      const y = priceYuan(t);
      /*
        ⚠️ 只把**真正免费**的算进"免费"档 —— 判据是"没有价格"，不是 `tier`。
        早先用 `t.tier === "free" || y === 0`，会把 `premium` 档模板也吞进来
        （它们 `tier="premium"` 但有 ¥18–20 的标价）→ "免费档 5 套"里
        混着高级订阅模板，用户看到的档位与实情不符。
        `premium` 档是有价的（靠订阅生效，但标价在），按价格归入对应档位更诚实。
      */
      if (d.key === "free") return y === 0;
      if (d.key === "lux") return y >= d.min; // 最高档放开上界（¥99+ 也归豪华）
      return y >= d.min && y < d.max;
    }).length;
    return { key: d.key, label: d.label, range: d.range, count, current: false };
  });
  /*
    补一条"高级订阅"角标说明：premium 档模板有标价（¥18–20）但**实际靠订阅生效**，
    按价格它们会被归进入门/中档，用户可能疑惑"我开了订阅为什么还要挑档次"。
    在阶梯右侧点一句，把这条路径讲清楚。
  */
  const premiumTplCount = tierItems.filter((t) => t.tier === "premium").length;
  /*
    当前档 = **当前模板**的价格落在哪一档。

    ⚠️ 这里**复用上面那张 `TIER_BANDS` 表**来判档，而不是另写一串 if 阈值。
    早先手写成 `curPrice < 1500 ? "entry" : ...` ——
    `priceYuan()` 返回的是**元**，阈值却写的是**分**，
    于是 ¥99 的「堂上规制」被判成"入门档"（99 < 1500 恒真）。
    这与阶段 4 踩的 `priceFen` 单位坑是同一个病：
    **"同一件事的判据写了两份"**。现在只留一份表，两处共用。

    未选模板（自定义搭配）→ 免费档（用户没花模板钱，与对比左屏同口径）。
  */
  const curPrice = currentTemplate ? priceYuan(currentTemplate) : 0;
  /** 用与统计同一张表判档：命中第一个 [min,max) 区间 */
  function bandOfYuan(y: number): string {
    if (y <= 0) return "free";
    for (const d of TIER_BANDS) {
      if (d.key === "free") continue;
      if (d.key === "lux") return y >= d.min ? "lux" : "";
      if (y >= d.min && y < d.max) return d.key;
    }
    return "lux";
  }
  const currentRungKey = bandOfYuan(curPrice) || "entry";
  for (const r of tierRungs) r.current = r.key === currentRungKey;

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
          <p className="mt-1 text-xs text-brand-400">{hint}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-brand-50 px-2 py-1 text-brand-600">我的积分：{userPoints}</span>
          {isPremium ? (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">高级订阅生效中 · 全部素材可用</span>
          ) : (
            <a href={premiumHref} className="rounded border border-amber-200 px-2 py-1 text-amber-700 hover:bg-amber-50">
              开通高级订阅解锁全部 →
            </a>
          )}
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            className="rounded border border-brand-300 px-2 py-1 text-brand-600 hover:bg-gray-50 disabled:opacity-50"
          >
            恢复默认
          </button>
        </div>
      </div>

      {/* 装修指引：可折叠，老用户可收起，不挡路 */}
      <DecorStudioGuide guideHref={guideHref} />

      {/*
        档次阶梯（阶段 5）。

        ⚠️ 与上面的 DecorStudioGuide **维度不同、不重复**：
          · Guide  = 操作流程（怎么装修：挑模板 → 换素材 → 存）
          · Ladder = 价值阶梯（我在哪一档、升一档差多少）
        所以两块可以相邻，但配色必须分开（Guide 用 accent，Ladder 用 amber 描金），
        否则并排两块会分不清谁是谁。

        阶梯**默认常驻、不做折叠** —— 它是装修动机本身，
        藏进折叠面板里就失去意义了（Guide 可折叠是因为老用户确实不需要）。
      */}
      <DecorTierLadder rungs={tierRungs} premiumCount={premiumTplCount} />

      {/*
        ===== 保存条 =====

        三种状态，互斥显示：
          · dirty   —— 有未保存改动，提示 + 「放弃改动」+「保存并完成装修」
          · justSaved —— 刚保存成功，给一次明确的完成反馈（含去馆页看看的入口）
          · 都没有   —— 不占地方

        ⚠️ 这里刻意**不做自动保存**。用户明确要的是「装修完了点保存即完成装修」——
        自动保存会让"完成"这个动作没有落点，也失去了"放心试搭配"的余地。
      */}
      {dirty && (
        <div
          data-decor-dirty=""
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5"
        >
          <span className="text-xs text-amber-800">
            有未保存的改动 —— 点「保存并完成装修」后才会在馆页生效
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="rounded border border-amber-300 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              放弃改动
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="rounded bg-accent-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busyId === "save" ? "保存中…" : "保存并完成装修"}
            </button>
          </div>
        </div>
      )}

      {!dirty && justSaved && (
        <div
          data-decor-saved=""
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5"
        >
          <span className="text-xs text-emerald-800">
            ✓ 装修已保存完成，馆页已同步更新
          </span>
          <a
            href={hallHref}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-emerald-300 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
          >
            去馆页看看 →
          </a>
        </div>
      )}

      {/*
        3D 实时预览：装修的核心体验 —— 每点一次素材，上面这块空间立刻变样。
        放在分类切换**之前**：用户选素材时视线不用来回跳。
        做成"编辑 → 预览"上下分栏在窄屏会挤，所以预览固定在顶部。

        ⚠️ 高度给 340（右边方案卡差不多就这么高），并把外框也设成 340。
        早先只给场景 300、而右边卡片内容更高，于是网格行被卡片撑高、
        场景按 300 居中 → 上下各留一条深色空档，看着像"画面没铺满、两边黑边"。
        右侧卡片再长也不该影响左侧高度，所以两边都锁同一个数。

        ⚠️ `engine="v2"` 是**阶段 0–5 的唯一启用点**：工坊走 v2（结构层 +
        六层光影），公页仍走 v1。这样用户能先在工坊看到"免费 vs 豪华"的
        真实落差，而公页零风险 —— 出问题只改这一行就能回退。

        ===== 对比视图（阶段 1）=====

        左右并排：左「未装修」恒为素白基准，右「当前方案」随编辑实时变。
        这是"装修动机"的证据 —— 用户一眼看到自己即将获得的落差。

        ⚠️ 两个 `Decor3DScene` 实例**各自持有 ResizeObserver + containerW**，
           它们在同一个网格行里宽度相同，但 DOM 各自独立，
           所以没有"共用宽度互相覆盖"的问题（每个实例只 observe 自己的 boxRef）。
           代价是两倍 DOM —— basic 档（未装修）结构节点极少，实测开销可忽略。

        ⚠️ 左屏 `interactive={false}`：对比屏是用来"看"的，不是用来"转"的。
           两屏都能拖会让用户以为要分别操作；锁掉左屏、只留右屏可环视，
           视线自然落在"我在改的这一屏"上。
      */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-brand-700">3D 实时预览</span>
          <span className="text-[11px] text-brand-400">
            {compare ? "左：未装修（素白基准） · 右：当前方案（可拖拽环视）" : "拖动画面可左右环视"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            data-decor-compare-toggle=""
            aria-pressed={compare}
            className="rounded border border-brand-300 px-2.5 py-1 text-[11px] text-brand-600 hover:bg-gray-50"
          >
            {compare ? "关闭对比" : "与未装修对比"}
          </button>
          <button
            type="button"
            onClick={() => setFullOpen(true)}
            className="rounded border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] text-brand-700 hover:bg-brand-100"
          >
            全屏预览
          </button>
        </div>
      </div>

      {/*
        ⚠️ 布局分两种，别用同一套网格硬扛：

        · **关闭对比**：`[1.35fr_1fr]` —— 场景在左、方案摘要卡在右（老布局）。
        · **开启对比**：场景区**占满整行**，方案摘要卡**移到下面**。

        为什么不在老布局的"左列"里再套一层两列网格？
        试过了，实测左列只有 ~587px，两屏各 290px —— 3D 空间在 290×340 的
        近竖屏比例里被挤压变形（立柱挤在一起、藻井出画），
        而"对比"恰恰要靠**看清建筑形态**才有说服力。
        所以对比时让场景吃满宽度（~1200px，两屏各 ~590px），
        摘要卡下移一行 —— 它本来也不是对比时最需要盯的东西。
      */}
      <div
        className={
          compare
            ? "mt-2 grid gap-4"
            : "mt-2 grid gap-4 lg:grid-cols-[1.35fr_1fr]"
        }
      >
        {/*
          场景列：开启对比时是"两屏并排"，关闭时只剩当前方案。
          `data-decor-compare` 挂在这层，验收脚本据此断言"对比视图真的渲染了"——
          注意它是**客户端 state 驱动**的，服务端 HTML 里没有（AGENTS.md 陷阱 12），
          所以断言必须走 Playwright 真渲染，不能用 fetch 读 HTML。
        */}
        <div
          data-decor-compare={compare ? "on" : "off"}
          className={compare ? "grid gap-3 sm:grid-cols-2" : "relative"}
        >
          {/*
            ⚠️ 这里**不能**写死像素高度，必须让场景按自己的几何比例撑开。

            场景的几何是 `unitToPx`（只按宽度换算）+ 正面墙 62u + 地面旋转
            投影 40u·cos78°，合计 ≈ 0.703 × 宽度。原先写死 360px，
            而对比模式两屏并排时每屏约 513px 宽 → 需要 361px，
            **正好差 1px**：台基被切掉一条、"漂浮的棕色盒子"就是这么来的
            （1px 的代价是整块台基，因为它是贴底绘制的）。

            改用 `aspect-[1000/703]` 让高度由宽度推导，两屏并排 / 单屏
            两种布局都自适应，窄屏也不会再把结构挤出画面。
            若哪天要调场景比例，改 `Decor3DScene` 的 aspectRatio 即可，
            这里保持同步（两处都指向同一个 1000/703）。
          */}
          {compare && (
            <div className="relative aspect-[1000/703]" data-decor-compare-pane="before">
              <DecorSpacePreview
                decor={baselineDecor}
                spaceKind="classic"
                interactive={false}
                showBadge={false}
                className="absolute inset-0"
                engine="v2"
              />
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur">
                未装修 · 素白基准
              </span>
            </div>
          )}

          <div className="relative aspect-[1000/703]" data-decor-compare-pane="after">
            <DecorSpacePreview
              decor={current}
              spaceKind={currentSpaceKind}
              className="absolute inset-0"
              engine="v2"
            />
            {/*
              整店套餐"一键整装"的瞬时高亮：改五个槽位后画面骤变，
              给一圈 ring 让用户接住"刚才那一下换了一整套"。
              1.5s 自动消失，不常驻。
            */}
            {kitFlash && (
              <span
                data-kit-applied=""
                className="pointer-events-none absolute inset-0 rounded ring-2 ring-amber-300/80"
              />
            )}
            {compare && (
              <span
                data-decor-compare-label="after"
                className="pointer-events-none absolute left-2 top-2 rounded bg-accent-600/85 px-2 py-0.5 text-[10px] text-white backdrop-blur"
              >
                当前方案 · {SPACE_NAME_MAP[currentSpaceKind] ?? "常规厅堂"}
              </span>
            )}
            {!compare && (
              <button
                type="button"
                onClick={() => setFullOpen(true)}
                className="absolute bottom-2 right-2 rounded border border-white/25 bg-black/45 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur hover:bg-black/65"
              >
                全屏预览
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
          <div className="text-xs font-medium text-brand-700">当前装修方案</div>
          <div className="mt-2 space-y-1.5 text-xs text-brand-500">
            {(["wall", "floor", "ornament", "frame", "font"] as DecorSlot[]).map((s) => (
              <div key={s} className="flex items-baseline gap-2">
                <span className="w-10 shrink-0 text-brand-400">{SLOT_NAME[s]}</span>
                <span className="text-brand-700">
                  {s === "ornament"
                    ? current.slots.ornament
                        .map((id) => SLOT_LABEL_LOOKUP[s][id] ?? id)
                        .join("、")
                    : SLOT_LABEL_LOOKUP[s][slotMainValue(s, current)] ??
                      slotMainValue(s, current)}
                </span>
              </div>
            ))}
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-brand-400">模板</span>
              <span className="text-brand-700">
                {current.templateId
                  ? (categories.find((c) => c.key === "template")?.items as DecorStudioEntry[] | undefined)
                      ?.find((t) => t.id === current.templateId)?.name ?? current.templateId
                  : "自定义搭配"}
              </span>
            </div>
            {granted.length > 0 && (
              <div className="flex items-baseline gap-2">
                <span className="w-10 shrink-0 text-brand-400">赠品</span>
                <span className="text-emerald-700">
                  {/*
                    ⚠️ 这里要显示**模板名**，不是模板 id。
                    早先直接 `granted.join("、")` 会把 `tpl-niche` 原样打给用户看，
                    用户根本不知道那是什么（截图里就是「赠品 tpl-niche」）。
                    查不到名字时退回 id —— 至少不会显示空白。
                  */}
                  {granted
                    .map(
                      (id) =>
                        (categories.find((c) => c.key === "template")?.items as DecorStudioEntry[] | undefined)
                          ?.find((t) => t.id === id)?.name ?? id,
                    )
                    .join("、")}
                  （永久有效，不受「恢复默认」影响）
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-brand-400">
            {compare
              ? "左屏为「未装修」素白基准（固定不动），右屏可拖拽环视。"
              : "拖拽左侧画面可左右环视。"}
            空间形态由所选模板决定，单换壁纸/挂饰不会改变空间结构。
          </p>
        </div>
      </div>

      {/* 分类切换 */}
      <div className="mt-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setTab(c.key)}
            className={
              "rounded-full px-3 py-1.5 text-xs transition " +
              (tab === c.key
                ? "bg-brand-800 text-white"
                : "border border-brand-200 text-brand-600 hover:border-accent-400")
            }
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-brand-400">
        {activeCat.key === "ornament" && (
          <span className="mr-2 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-700">
            可同时陈设 {MAX_ORNAMENTS} 件
          </span>
        )}
        {activeCat.hint}
      </p>

      {/* 素材墙 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab === "template"
          ? (activeCat.items as DecorStudioEntry[]).map((tpl) => {
              const locked = isTemplateLocked(tpl);
              const active = current.templateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className={
                    "overflow-hidden rounded-lg border transition " +
                    (active ? "border-accent-500 ring-2 ring-accent-200" : "border-brand-200")
                  }
                >
                  <div
                    className="flex h-24 items-center justify-center text-3xl"
                    style={{ background: tpl.preview.background, color: tpl.preview.color }}
                  >
                    <span>{tpl.preview.icon}</span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-brand-900">{tpl.name}</span>
                      {/*
                        ⚠️ 第 4 个参数 priceFen **不能漏** ——
                        漏了徽章就只显示积分、不显示"¥N"，用户看不到模板多少钱。
                        套件卡那处一直传着（tierBadge(kit.tier, ..., kit.priceFen)），
                        模板这处漏传过，属于"两处调用口径不一致"。
                      */}
                      {tierBadge(tpl.tier, locked, tpl.points, tpl.priceFen)}
                      {active && <span className="text-[10px] text-accent-600">使用中</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-brand-400">{tpl.desc}</p>
                    {/* 租期提示：仅租期制条目（非永久）显示 */}
                    {!locked && leaseUntil(`tpl:${tpl.id}`) && (
                      <p className="mt-1 text-[10px] text-brand-300">
                        有效期至 {leaseUntil(`tpl:${tpl.id}`)}，到期后可续费恢复
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(tpl.tags ?? []).map((g) => (
                        <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-brand-500">
                          {g}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3">
                      {locked ? (
                        tpl.tier === "premium" ? (
                          <a
                            href={premiumHref}
                            className="block w-full rounded border border-amber-300 px-3 py-1.5 text-center text-xs text-amber-700 hover:bg-amber-50"
                          >
                            开通高级订阅解锁
                          </a>
                        ) : (
                          /*
                            points 与 buyout 走同一个按钮：用户口径是
                            「付费是指可以积分兑换也可以用货币支付」，
                            所以积分兑换入口对两者都开放；想花钱的去商城买（同一个键）。
                          */
                          <button
                            type="button"
                            onClick={() => onUnlock("template", tpl.id)}
                            disabled={busy}
                            className="w-full rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {busyId === `unlock-${tpl.id}`
                              ? "兑换中…"
                              : isKeyExpired(`tpl:${tpl.id}`)
                                ? `已到期 · 续费 ${tpl.points} 积分`
                                : `用 ${tpl.points} 积分兑换`}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onTemplate(tpl)}
                          disabled={busy}
                          className="w-full rounded bg-brand-800 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {busyId === `tpl-${tpl.id}` ? "应用中…" : active ? "重新应用" : "一键应用"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          : tab === "kit"
            ? (activeCat.items as DecorStudioEntry[]).map((kit) => {
                const locked = isKitLocked(kit);
                const full = isFullStoreKit(kit);
                /*
                  「使用中」判定（宽松口径）：套件带来的**每件素材**都已在当前草稿里。
                  挂饰比清单（草稿可能比套件多几件，也算在用）；其余槽位比单值。
                  不要求 templateId 为空 —— 用户应用套件后换模板，套件的挂饰仍在用。
                  套件卡此前没有任何状态标记，点完"应用套件"看不出成败，
                  是"点了没反应"观感的另一半来源（模板/素材卡都有「使用中」）。
                */
                const kitSlotsNow = kitSlots(kit);
                const kitActive =
                  !locked &&
                  Object.entries(kitSlotsNow).length > 0 &&
                  Object.entries(kitSlotsNow).every(([slot, v]) => {
                    if (slot === "ornament") {
                      const arr = Array.isArray(v) ? v : [v];
                      return arr.every((id) => current.slots.ornament.includes(id));
                    }
                    return current.slots[slot as keyof typeof current.slots] === v;
                  });
                return (
                  <div
                    key={kit.id}
                    data-kit-applies={full ? "full" : "decor"}
                    /*
                      把该套件"点一下会落到哪五个槽位"的**数据层声明**暴露成 DOM 属性。

                      ⚠️ 这里**刻意不走 `kitSlots()`**，直接取 `kit.applies`。
                      因为 `kitSlots()` 就是被验收的那段逻辑本身 ——
                      拿它的输出去当断言的"期望值"，缺陷会被一起带进期望值里，
                      两边同错、自洽，断言反而变绿（本轮实测踩到：注释掉 applies 分支后
                      仍然 28/28 全绿）。
                      断言的期望值必须来自**独立于被测逻辑的真相**，也就是数据层的
                      `applies` 原值；`kitSlots()` 的产物只作为"实际行为"被比对。
                      `kitSlots()` 仍会兜底（旧套件没有 applies 字段时用前缀推断），
                      但那个兜底结果不用于断言。
                    */
                    data-kit-slots={JSON.stringify(kit.applies ?? kitSlots(kit))}
                    className="overflow-hidden rounded-lg border border-brand-200"
                  >
                    <div
                      className="flex h-24 items-center justify-center text-3xl"
                      style={{ background: kit.preview.background, color: kit.preview.color }}
                    >
                      <span>{kit.preview.icon}</span>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-brand-900">{kit.name}</span>
                        {kitActive && <span className="text-[10px] text-accent-600">使用中</span>}
                        {tierBadge(kit.tier, locked, kit.points, kit.priceFen)}
                        {full && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                            含墙与地
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs text-brand-400">{kit.desc}</p>
                      {/* 租期提示：仅租期制条目（非永久）显示 */}
                      {!locked && leaseUntil(`kit:${kit.id}`) && (
                        <p className="mt-1 text-[10px] text-brand-300">
                          有效期至 {leaseUntil(`kit:${kit.id}`)}，到期后可续费恢复
                        </p>
                      )}
                      {/*
                        ⚠️ 文案必须分两种 —— 早先写死"只换挂饰/相框/字体，保留你挑好的墙与地"，
                        对**整店套餐是错的**：它的 applies 里就有 wall/floor，点下去墙地都会换。
                        写错的后果是用户买完发现"墙被换了"或"没换"，与文案承诺相反。
                      */}
                      <p className="mt-1.5 text-[10px] text-brand-400">
                        含 {(kit.includes ?? []).length} 件素材 ·{" "}
                        {full
                          ? "一键换整套（含墙与地）"
                          : "只换挂饰/相框/字体，保留你挑好的墙与地"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(kit.tags ?? []).map((g) => (
                          <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-brand-500">
                            {g}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3">
                        {locked ? (
                          kit.tier === "premium" ? (
                            <a
                              href={premiumHref}
                              className="block w-full rounded border border-amber-300 px-3 py-1.5 text-center text-xs text-amber-700 hover:bg-amber-50"
                            >
                              开通高级订阅解锁
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onUnlock("kit", kit.id)}
                              disabled={busy}
                              className="w-full rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              {busyId === `unlock-${kit.id}`
                                ? "兑换中…"
                                : isKeyExpired(`kit:${kit.id}`)
                                  ? `已到期 · 续费 ${kit.points} 积分`
                                  : `用 ${kit.points} 积分兑换`}
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => onKit(kit)}
                            disabled={busy}
                            className="w-full rounded bg-brand-800 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {busyId === `kit-${kit.id}`
                              ? "应用中…"
                              : full
                                ? "一键整装"
                                : kitActive
                                  ? "重新应用"
                                  : "应用套件"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
          : (activeCat.items as DecorStudioEntry[]).map((item) => {
              const locked = isItemLocked(item);
              /*
                多挂饰：挂饰分类的"选中"看清单（ornaments.includes），
                其余槽位仍看单值槽位。清单缺省时回落单值（旧数据兼容）。
              */
              const active =
                activeCat.key === "ornament"
                  ? current.slots.ornament.includes(item.id)
                  : current.slots[activeCat.key as DecorSlot] === item.id;
              // 自定义缩略图（宗祠用真实构件微缩图）；返回 null 则回退 emoji
              const thumb = renderThumb?.(item, activeCat.key as DecorSlot) ?? null;
              return (
                <div
                  key={item.id}
                  /*
                    `data-decor-item-id` = 素材的真实 id（不是显示名）。
                    给验收脚本用：套件的 `data-kit-slots` 声明的是 id，
                    脚本需要把"摘要里显示的素材名"换算回 id 才能逐字比对
                    （显示名会随文案调整变，id 是稳定的）。见 verify-decor-studio-v3 §2。
                  */
                  data-decor-item-id={item.id}
                  data-decor-item-slot={activeCat.key}
                  className={
                    "overflow-hidden rounded-lg border transition " +
                    (active ? "border-accent-500 ring-2 ring-accent-200" : "border-brand-200")
                  }
                >
                  {thumb ? (
                    /*
                      真实构件缩略图：白色"宣纸"底 + 自适应高宽。
                      构件本身是 SVG（viewBox 固定），这里只给宽度、高度交给比例，
                      因此 40+ 张缩略图既不变形也不会有 layout 抖动。
                    */
                    <div className="flex h-20 items-center justify-center overflow-hidden bg-[#f7f4ec] px-2">
                      {thumb}
                    </div>
                  ) : (
                    <div
                      className="flex h-20 items-center justify-center text-2xl"
                      style={{
                        background: item.preview.background,
                        color: item.preview.color,
                        border: item.preview.border,
                        fontFamily: item.preview.fontFamily,
                      }}
                    >
                      {item.preview.icon ?? "◻"}
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span data-decor-item-name className="text-sm font-medium text-brand-900">
                        {item.name}
                      </span>
                      {tierBadge(item.tier, locked, item.points, item.priceFen)}
                      {active && (
                        <span className="text-[10px] text-accent-600">
                          {/*
                            多挂饰：≥2 件时给每件标序位（首件即主陈设），
                            让"哪件排第几"可见，否则用户不知道取消哪件会影响主陈设。
                          */}
                          {activeCat.key === "ornament" &&
                          current.slots.ornament.length > 1 &&
                          current.slots.ornament.includes(item.id)
                            ? `陈设 ${current.slots.ornament.indexOf(item.id) + 1}`
                            : "使用中"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-brand-400">{item.desc}</p>
                    {/* 租期提示：仅租期制条目（非永久）显示，存量已购无条目 → 不渲染 */}
                    {!locked && leaseUntil(`buy:${item.id}`) && (
                      <p className="mt-1 text-[10px] text-brand-300">
                        有效期至 {leaseUntil(`buy:${item.id}`)}，到期后可续费恢复
                      </p>
                    )}
                    <div className="mt-3">
                      {locked ? (
                        /*
                          已锁定分两种，**不能混用同一个按钮**：
                            · points  → 可用积分解锁，显示「用 N 积分兑换」
                            · premium → 积分买不到，只能开高级订阅；早先误落进积分分支，
                                        于是渲染出「用 undefined 积分兑换」（points 字段为空）。
                        */
                        item.tier === "premium" ? (
                          <a
                            href={premiumHref}
                            className="block w-full rounded border border-amber-300 px-3 py-1.5 text-center text-xs text-amber-700 hover:bg-amber-50"
                          >
                            开通高级订阅解锁
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUnlock("item", item.id)}
                            disabled={busy}
                            className="w-full rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {busyId === `unlock-${item.id}`
                              ? "兑换中…"
                              : isKeyExpired(`buy:${item.id}`)
                                ? `已到期 · 续费 ${item.points} 积分`
                                : `用 ${item.points} 积分兑换`}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onItem(activeCat.key as DecorSlot, item)}
                          disabled={busy}
                          className="w-full rounded bg-brand-800 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {busyId === `item-${item.id}` ? "应用中…" : active ? "使用中" : "应用"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {msg && (
        <p className={"mt-3 text-sm " + (msg.ok ? "text-green-600" : "text-red-500")}>{msg.message}</p>
      )}

      {/*
        底部摘要已移除 —— 方案摘要挪到了顶部 3D 预览右侧。
        保留两份会互相打架：用户在顶部改了槽位，滚到底部看到的是修改前的值，
        会误判"改了没生效"。
      */}

      {/*
        全屏预览挂在最后：它是 fixed 定位的覆盖层，DOM 位置不影响观感，
        放最后可以让"编辑区"的 DOM 结构保持清爽（不在中间插一个全屏层）。
      */}
      <DecorFullPreview
        open={fullOpen}
        onClose={() => setFullOpen(false)}
        decor={current}
        spaceKind={currentSpaceKind}
        spaceName={SPACE_NAME_MAP[currentSpaceKind] ?? "常规厅堂"}
        title={`${title} · 预览`}
        engine="v2"
        skin={previewSkin}
        dark={previewDark}
        hallName={hallName}
      />
    </section>
  );
}

/** 空间形态的中文名（与 DecorSpacePreview 的 SPACE_LABEL 保持同一口径） */
const SPACE_NAME_MAP: Record<string, string> = {
  classic: "常规厅堂",
  niche: "壁龛纪念墙",
  shrine: "祠堂正殿",
  courtyard: "天井庭院",
  gate: "山门仪门",
  hall: "厅堂大殿",
  pond: "池畔夜景",
  starfield: "星河天穹",
};

const SLOT_NAME: Record<DecorSlot, string> = {
  wall: "壁纸",
  floor: "地纹",
  ornament: "挂饰",
  frame: "相框",
  font: "字体",
};

/**
 * 套件是不是「整店套餐」。
 *
 * 判据是 `applies` 里**含 wall 或 floor** —— 不是"includes 里有没有墙地 id"。
 * 理由：applies 是权威映射；用 includes 判会再退回"前缀命名约定"那个巧合。
 *
 * 两种套件对用户的意义完全不同，UI 与行为都要分开：
 *   · 整店套餐 → 「一键整装」，连墙带地全换
 *   · 普通套件 → 「应用套件」，只换挂饰/相框/字体，保留用户挑好的墙与地
 */
function isFullStoreKit(kit: { applies?: DecorKitSlots }): boolean {
  const a = kit.applies;
  return !!a && (!!a.wall || !!a.floor);
}

/**
 * 由素材 id 前缀推断它属于哪个槽位。
 *
 * 套件的 `includes` 是**素材 id 列表**，本身不带槽位信息（见 DecorKit 定义），
 * 但"应用套件"必须知道每件素材该放到哪个槽位，否则写不进去。
 * 素材 id 的命名是有约定前缀的（wall- / floor- / orn- / frame- / font-），
 * 宗祠侧统一带 `clan-` 前缀，所以先剥前缀再判。
 *
 * ⚠️ 返回 undefined 表示前缀不认识 —— 调用方必须**跳过**而不是猜一个槽位兜底：
 *    猜错槽位会把挂饰写进壁纸位，用户看到的是"套件应用了，但画面变成了一块布"。
 */
function SLOT_OF_PREFIX(id: string): DecorSlot | undefined {
  const bare = id.replace(/^clan-/, "");
  if (bare.startsWith("wall-")) return "wall";
  if (bare.startsWith("floor-")) return "floor";
  if (bare.startsWith("orn-")) return "ornament";
  if (bare.startsWith("frame-")) return "frame";
  if (bare.startsWith("font-")) return "font";
  return undefined;
}

/**
 * 由分类目录构建 id → 名称 的查表。
 *
 * ⚠️ 必须**跳过所有非槽位分类**（template、kit），不能只跳 template。
 * 早先只写了 `if (cat.key === "template") continue`，新增 `kit` 分类之后
 * `slot` 变成 "kit"，`lookup["kit"]` 是 undefined，于是
 * `lookup["kit"][it.id] = it.name` 直接抛：
 *   TypeError: Cannot set properties of undefined (setting 'clan-kit-incense')
 * 报在套件 id 上，看着像套件数据写错，其实是这里少跳了一个分类 ——
 * 而且它会让**整个控制台页面崩掉**（React 渲染期抛错）。
 *
 * 用白名单（SLOT_KEYS）而不是黑名单：以后再加分类，默认就是安全跳过，
 * 不会再因为"忘了加一个 continue"把页面炸掉。
 */
function buildSlotLabels(
  categories: DecorCategoryGroup[],
): Record<DecorSlot, Record<string, string>> {
  const lookup: Record<DecorSlot, Record<string, string>> = {
    wall: {},
    floor: {},
    ornament: {},
    frame: {},
    font: {},
  };
  for (const cat of categories) {
    if (!SLOT_KEYS.includes(cat.key as DecorSlot)) continue;
    const slot = cat.key as DecorSlot;
    for (const it of cat.items as DecorStudioEntry[]) {
      lookup[slot][it.id] = it.name;
    }
  }
  return lookup;
}
