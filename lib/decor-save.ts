/**
 * 装修「草稿 → 保存」的公共落库逻辑。
 *
 * ## 为什么要单独抽一层
 *
 * 装修工坊原先是「点一下就立刻写库」（每点一次素材一次 Server Action）。
 * 用户要求改成「装修完了点保存即完成装修」，于是动作变成：
 *
 *   点素材 → 只改本地草稿（不落库）
 *   点保存 → 一次性把整份草稿提交上来，校验后原子写入
 *
 * 这里就是那个"提交上来之后"的处理。它**不能**简单地把校验抄一遍 ——
 * 抄一遍必然与 `isUnlocked()` / `normalizeDecor()` 漂移，
 * 表现是"保存时说过、刷新后变回去"这类最难的灵异问题。
 * 所以本文件只做**编排**，每一项素材的可用性判定一律复用 lib 里那套现成函数。
 *
 * ## 为什么不做成"逐条重放 N 个 action"
 *
 * 表面上更省事（复用已有 action），实际有三个坑：
 *   ① 非原子：第 3 条失败时前 2 条已经写进去了，用户看到"保存失败"但装修其实改了一半。
 *   ② N 次往返 + N 次 revalidate，隧道环境下明显卡顿（AGENTS.md 记过隧道抖动）。
 *   ③ 逐条都会 `templateId: undefined`（setDecorSlot 的语义），
 *      最后必须靠"谁最后跑完"决定 templateId 存不存在 —— 顺序耦合，非常脆。
 *
 * 一次性写入则天然原子，且 `templateId` 与 `slots` 的最终形态由调用方一次给定。
 */

import {
  DEFAULT_DECOR,
  GRANTED_TEMPLATE_PARTS,
  HallSlots,
  MAX_ORNAMENTS,
  SLOT_ITEMS as HALL_SLOT_ITEMS,
  buyKey,
  findTemplate,
  isKeyActive,
  tplKey,
  type DecorLeaseMap,
  type DecorSlot,
} from "@/lib/hall-decor";
import {
  CLAN_DEFAULT_DECOR,
  CLAN_SLOT_ITEMS,
  findClanTemplate,
  isClanUnlocked,
  type ClanDecorItem,
} from "@/lib/clan-decor";

/** 提交上来的草稿（只含"用户能改"的部分；unlocked/granted 是权益，不在此列） */
export type DecorDraft = {
  templateId?: string;
  /**
   * 各槽位选中的素材 id（挂饰槽为数组，单一真相源）。
   * 前端传 `slots.ornament` 即为"同时陈设"的清单（首件 = 主陈设）。
   */
  slots: HallSlots;
};

export type DecorEntitlements = {
  isPremium: boolean;
  unlocked: string[];
  granted: string[];
  /**
   * 权益租期表（2026-10 租期制）：解锁键 → 到期 ISO；缺条目 / null = 永久。
   * 调用方（console 两侧 actions.ts）从 readDecor 的返回值里带过来。
   * 不传 → isKeyActive 恒真 → 保存校验放行过期素材 —— 与渲染层口径分叉。
   */
  entitlements?: DecorLeaseMap;
};

export type SaveCheck =
  | { ok: true; draft: DecorDraft }
  | { ok: false; message: string; needUnlock?: { kind: string; id: string; slot?: string; points: number } };

/**
 * 是否"曾购但租期已过"（区别于"从未购买"）。
 * 过期素材的 slots 配置**保留在库里**（续费即恢复），所以用户重新保存时
 * 草稿里很可能还有过期素材 —— 拒单文案必须区分这两种情形，
 * 否则"我明明买过，却说我尚未解锁"会让用户以为权益被吞了。
 */
function isExpiredKey(key: string, ent: DecorEntitlements): boolean {
  return ent.unlocked.includes(key) && !isKeyActive(key, ent.entitlements);
}

/**
 * 解析前端提交的草稿。
 *
 * 前端传 `slots` 的 JSON 字符串（FormData 只能传字符串）。
 * 这里做**防御性解析**：解析不出来或字段非法一律退回默认值，
 * 绝不把 undefined 写进库。
 */
export function parseDecorDraft(raw: string): DecorDraft | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { templateId?: unknown; slots?: unknown };

  const slots: HallSlots = {
    wall: DEFAULT_DECOR.wall,
    floor: DEFAULT_DECOR.floor,
    frame: DEFAULT_DECOR.frame,
    font: DEFAULT_DECOR.font,
    ornament: [...DEFAULT_DECOR.ornament],
  };
  const src = (o.slots ?? {}) as Record<string, unknown>;
  for (const k of ["wall", "floor", "frame", "font"] as const) {
    const v = src[k];
    if (typeof v === "string" && v) slots[k] = v;
  }
  // 挂饰槽：接受 string（旧客户端草稿）或 string[]（新），统一成数组
  const rawOrn = src["ornament"];
  if (Array.isArray(rawOrn)) {
    const list = rawOrn
      .filter((x): x is string => typeof x === "string" && !!x)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, MAX_ORNAMENTS);
    slots.ornament = list.length > 0 ? list : [...DEFAULT_DECOR.ornament];
  } else if (typeof rawOrn === "string" && rawOrn) {
    slots.ornament = [rawOrn];
  }

  const templateId = typeof o.templateId === "string" && o.templateId ? o.templateId : undefined;

  return { templateId, slots };
}

/**
 * 校验纪念馆草稿：模板可用 + **每个槽位**的素材可用。
 *
 * 关键点：不能只验"用户这次改了什么"，要把整份草稿都验一遍。
 * 草稿存在客户端，理论上可被构造；只验改动项 = 留了后门，
 * 可以手搓 POST 把没买的素材写进装修。
 * 全量校验的代价只是一次数组查找。
 */
export function checkHallDraft(draft: DecorDraft, ent: DecorEntitlements): SaveCheck {
  let templateId: string | undefined;
  if (draft.templateId) {
    const tpl = findTemplate(draft.templateId);
    if (!tpl) return { ok: false, message: "模板不存在" };
    const tplKeyOf = tplKey(tpl.id);
    /*
      租期口径（2026-10）：unlocked 命中（含裸 id 老数据）**且** isKeyActive 放行才算可用。
      isKeyActive 缺条目 = 永久（存量已购兼容）—— 老数据行为与改造前逐字节一致。
    */
    const usable =
      tpl.tier === "free" ||
      ent.isPremium ||
      ent.granted.includes(tpl.id) ||
      ((ent.unlocked.includes(tplKeyOf) || ent.unlocked.includes(tpl.id)) &&
        isKeyActive(tplKeyOf, ent.entitlements));
    if (!usable) {
      if (tpl.tier === "premium") {
        return { ok: false, message: `模板「${tpl.name}」为高级订阅专属，开通后即可使用` };
      }
      if (isExpiredKey(tplKeyOf, ent)) {
        return {
          ok: false,
          message: `模板「${tpl.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "template", id: tpl.id, points: tpl.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `模板「${tpl.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "template", id: tpl.id, points: tpl.points ?? 0 },
      };
    }
    templateId = tpl.id;
  }

  const grantedParts = ent.granted.flatMap((tid) => GRANTED_TEMPLATE_PARTS[tid] ?? []);
  const slots: HallSlots = {
    wall: DEFAULT_DECOR.wall,
    floor: DEFAULT_DECOR.floor,
    frame: DEFAULT_DECOR.frame,
    font: DEFAULT_DECOR.font,
    ornament: [...DEFAULT_DECOR.ornament],
  };
  for (const slot of ["wall", "floor", "frame", "font"] as const) {
    const id = draft.slots[slot];
    const item = HALL_SLOT_ITEMS[slot].find((i) => i.id === id);
    if (!item) {
      // 失效 id：只退回该槽位默认值，不让整单失败 ——
      // 用户改了一堆东西，不该因为一个坏 id 全丢
      slots[slot] = DEFAULT_DECOR[slot];
      continue;
    }
    const itemKey = buyKey(item.id);
    // 租期口径同模板段：命中 unlocked 且 isKeyActive 放行（缺条目 = 永久）
    const usable =
      item.tier === "free" ||
      ent.isPremium ||
      grantedParts.includes(item.id) ||
      ((ent.unlocked.includes(item.id) || ent.unlocked.includes(itemKey)) &&
        isKeyActive(itemKey, ent.entitlements));
    if (!usable) {
      if (item.tier === "premium") {
        return { ok: false, message: `素材「${item.name}」为高级订阅专属` };
      }
      if (isExpiredKey(itemKey, ent)) {
        return {
          ok: false,
          message: `素材「${item.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "item", id: item.id, slot, points: item.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `素材「${item.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "item", id: item.id, slot, points: item.points ?? 0 },
      };
    }
    slots[slot] = item.id;
  }

  /*
    多挂饰（阶段 9 · 单一真相源）：draft.slots.ornament 即清单，每件都与单挂饰槽位
    **同一套判定**（free / premium / granted / unlocked），绝不在这里重写 tier 规则。
    未知 id 丢弃（与坏 slot id 同策略：不让整单失败）；未解锁 → 拒单。
    非空 / 去重 / 长度 ≤ MAX_ORNAMENTS 由 parseDecorDraft 兜底，这里再校一次解锁。
  */
  const rawOrns = Array.isArray(draft.slots.ornament)
    ? draft.slots.ornament.slice(0, MAX_ORNAMENTS)
    : typeof draft.slots.ornament === "string" && draft.slots.ornament
      ? [draft.slots.ornament]
      : [];
  const orns: string[] = [];
  for (const id of rawOrns) {
    if (orns.includes(id)) continue;
    const ornItem = HALL_SLOT_ITEMS.ornament.find((i) => i.id === id);
    if (!ornItem) continue;
    const ornKey = buyKey(ornItem.id);
    const ornUsable =
      ornItem.tier === "free" ||
      ent.isPremium ||
      grantedParts.includes(ornItem.id) ||
      ((ent.unlocked.includes(ornItem.id) || ent.unlocked.includes(ornKey)) &&
        isKeyActive(ornKey, ent.entitlements));
    if (!ornUsable) {
      if (ornItem.tier === "premium") {
        return { ok: false, message: `素材「${ornItem.name}」为高级订阅专属` };
      }
      if (isExpiredKey(ornKey, ent)) {
        return {
          ok: false,
          message: `素材「${ornItem.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "item", id: ornItem.id, slot: "ornament", points: ornItem.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `素材「${ornItem.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "item", id: ornItem.id, slot: "ornament", points: ornItem.points ?? 0 },
      };
    }
    orns.push(id);
  }
  slots.ornament = orns.length > 0 ? orns : [...DEFAULT_DECOR.ornament];

  return { ok: true, draft: { templateId, slots } };
}

/**
 * 宗祠侧的同一套逻辑。
 *
 * 为什么不合并成一个「通用」函数：素材类型不同（`DecorItem` vs `ClanDecorItem`）、
 * 槽位表也不同。强行泛型化会引入一堆类型体操，反而不如显式两遍清楚。
 *
 * 但**判定规则必须逐条对应**，而且这里一律**委托给 `isClanUnlocked()`** ——
 * 绝不在这里重写 tier 判断，重写就是与 `normalizeClanDecor` 漂移的开始。
 */
export function checkClanDraft(draft: DecorDraft, ent: DecorEntitlements): SaveCheck {
  let templateId: string | undefined;
  if (draft.templateId) {
    const tpl = findClanTemplate(draft.templateId);
    if (!tpl) return { ok: false, message: "模板不存在" };
    const usable = isClanUnlocked(tpl as unknown as ClanDecorItem, {
      isPremium: ent.isPremium,
      unlocked: ent.unlocked,
      granted: ent.granted,
      entitlements: ent.entitlements,
    });
    if (!usable) {
      if (tpl.tier === "premium") {
        return { ok: false, message: `模板「${tpl.name}」为高级订阅专属，开通后即可使用` };
      }
      if (isExpiredKey(tplKey(tpl.id), ent)) {
        return {
          ok: false,
          message: `模板「${tpl.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "template", id: tpl.id, points: tpl.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `模板「${tpl.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "template", id: tpl.id, points: tpl.points ?? 0 },
      };
    }
    templateId = tpl.id;
  }

  const slots: HallSlots = {
    wall: CLAN_DEFAULT_DECOR.wall,
    floor: CLAN_DEFAULT_DECOR.floor,
    frame: CLAN_DEFAULT_DECOR.frame,
    font: CLAN_DEFAULT_DECOR.font,
    ornament: [...CLAN_DEFAULT_DECOR.ornament],
  };
  for (const slot of ["wall", "floor", "frame", "font"] as const) {
    const id = draft.slots[slot];
    const item = CLAN_SLOT_ITEMS[slot].find((i) => i.id === id);
    if (!item) {
      slots[slot] = CLAN_DEFAULT_DECOR[slot];
      continue;
    }
    const usable = isClanUnlocked(item, {
      isPremium: ent.isPremium,
      unlocked: ent.unlocked,
      granted: ent.granted,
      entitlements: ent.entitlements,
    });
    if (!usable) {
      if (item.tier === "premium") {
        return { ok: false, message: `素材「${item.name}」为高级订阅专属` };
      }
      if (isExpiredKey(buyKey(item.id), ent)) {
        return {
          ok: false,
          message: `素材「${item.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "item", id: item.id, slot, points: item.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `素材「${item.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "item", id: item.id, slot, points: item.points ?? 0 },
      };
    }
    slots[slot] = item.id;
  }

  /*
    多挂饰（阶段 9，宗祠侧）：与 checkHallDraft **逐条对应**的清单校验，
    可用性一律委托 isClanUnlocked（本文件头的老规矩：绝不重写 tier 判断）。
    通过后 slots.ornament 即完整清单（首件为主陈设）。
  */
  const rawOrns = Array.isArray(draft.slots.ornament)
    ? draft.slots.ornament.slice(0, MAX_ORNAMENTS)
    : typeof draft.slots.ornament === "string" && draft.slots.ornament
      ? [draft.slots.ornament]
      : [];
  const orns: string[] = [];
  for (const id of rawOrns) {
    if (orns.includes(id)) continue;
    const ornItem = CLAN_SLOT_ITEMS.ornament.find((i) => i.id === id);
    if (!ornItem) continue;
    const ornUsable = isClanUnlocked(ornItem, {
      isPremium: ent.isPremium,
      unlocked: ent.unlocked,
      granted: ent.granted,
      entitlements: ent.entitlements,
    });
    if (!ornUsable) {
      if (ornItem.tier === "premium") {
        return { ok: false, message: `素材「${ornItem.name}」为高级订阅专属` };
      }
      if (isExpiredKey(buyKey(ornItem.id), ent)) {
        return {
          ok: false,
          message: `素材「${ornItem.name}」权益已到期，续费后即可恢复使用`,
          needUnlock: { kind: "item", id: ornItem.id, slot: "ornament", points: ornItem.points ?? 0 },
        };
      }
      return {
        ok: false,
        message: `素材「${ornItem.name}」尚未解锁，请先兑换或购买`,
        needUnlock: { kind: "item", id: ornItem.id, slot: "ornament", points: ornItem.points ?? 0 },
      };
    }
    orns.push(id);
  }
  slots.ornament = orns.length > 0 ? orns : [...CLAN_DEFAULT_DECOR.ornament];

  return { ok: true, draft: { templateId, slots } };
}

/**
 * 草稿的空间形态：只读模板自己声明的 `space`，**不做推断**。
 *
 * 想过"根据所选挂饰猜一个空间"，那会让预览与落地不一致 ——
 * 馆页也是只看模板的 space，两边算法不同就是漂移。
 */
export function draftSpaceOf(tpl: { space?: string } | undefined): string {
  return tpl?.space ?? "classic";
}
