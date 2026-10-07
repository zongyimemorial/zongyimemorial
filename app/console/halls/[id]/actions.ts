"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints } from "@/lib/points";
import { removeHallImage, statManagedUpload } from "@/lib/upload";
import {
  DEFAULT_DECOR,
  GRANTED_TEMPLATE_PARTS,
  KITS,
  SLOT_ITEMS,
  buyKey,
  findDecorItem,
  findTemplate,
  isGrantedPart,
  isKeyActive,
  nextExpiry,
  normalizeDecor,
  normalizeEntitlements,
  normalizeLayout,
  tplKey,
  type DecorSlot,
  type HallDecor,
} from "@/lib/hall-decor";
import { HALL_DEFAULT_ORDER } from "@/lib/section-order";
// CLAN_KITS 定义在 clan-decor.ts（值不能跨库定义，见该处注释）
import { CLAN_KITS } from "@/lib/clan-decor";
import { checkHallDraft, parseDecorDraft } from "@/lib/decor-save";
import { isPremiumUntil } from "@/lib/premium";
import { createOrder } from "@/lib/orders";
import { STORAGE_PLANS } from "@/lib/storage";

type HallRow = {
  id: string;
  ownerUserId: string;
  premiumUntil: Date | null;
  couplet: unknown;
  archive: unknown;
  templateConfig: unknown;
};

/** 服务端动作返回结构 */
export type ActionResult = {
  ok: boolean;
  message?: string;
  needUnlock?: { kind: string; id: string; slot?: string; points: number };
};

/** 取场馆 + 权限校验，返回归一化后的上下文 */
async function loadHall(
  hallId: string,
): Promise<{ error: string } | { user: { id?: string; premiumUntil: Date | null }; hall: HallRow }> {
  const user = await getCurrentUser();
  if (!user?.id) return { error: "请先登录" };
  const hall = await prisma.memorialHall.findUnique({
    where: { id: hallId },
    select: {
      id: true,
      ownerUserId: true,
      premiumUntil: true,
      couplet: true,
      archive: true,
      templateConfig: true,
    },
  });
  if (!hall) return { error: "纪念馆不存在" };
  if (hall.ownerUserId !== user.id) return { error: "只有馆主可以编辑" };

  /*
    ⚠️ 必须一并取回**用户级** premiumUntil —— 见 isPremiumOf() 注释。
    与宗祠侧同源问题（"宗祠装修后无法保存"），这里提前对齐，
    免得纪念馆侧哪天出现同样的"UI 说全解锁、保存却驳回"。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { premiumUntil: true },
  });
  return { user: { id: user.id, premiumUntil: dbUser?.premiumUntil ?? null }, hall: hall as HallRow };
}

/**
 * 是否享有高级订阅 —— **馆级 OR 用户级**（产品口径，与宗祠侧一字不差）。
 * 详见 `app/console/clan-halls/[id]/actions.ts` 的 isPremiumOf() 注释。
 */
function isPremiumOf(ctx: { user: { premiumUntil: Date | null }; hall: HallRow }) {
  return isPremiumUntil(ctx.user.premiumUntil) || isPremiumUntil(ctx.hall.premiumUntil);
}

function readDecor(ctx: { user: { premiumUntil: Date | null }; hall: HallRow }): HallDecor {
  const cfg = (ctx.hall.templateConfig as { decor?: unknown } | null) ?? {};
  const raw = (cfg.decor ?? {}) as Partial<HallDecor>;
  const unlocked = Array.isArray(raw.unlocked) ? raw.unlocked.map(String) : [];
  const granted = Array.isArray(raw.granted) ? raw.granted.map(String) : [];
  return normalizeDecor({ ...raw, slots: { ...DEFAULT_DECOR, ...(raw.slots ?? {}) } }, {
    isPremium: isPremiumOf(ctx),
    unlocked,
    granted,
    entitlements: normalizeEntitlements(raw.entitlements),
  });
}

async function writeDecor(hallId: string, hall: HallRow, decor: HallDecor) {
  const cfg = (hall.templateConfig as Record<string, unknown> | null) ?? {};
  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { templateConfig: { ...cfg, decor: { ...decor, updatedAt: new Date().toISOString() } } },
  });
}

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}`);
  revalidatePath(`/console/halls/${hallId}`);
}

// ===========================================================================
// 1) 保存挽联 / 故人数字档案
// ===========================================================================
export async function saveHallProfile(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const couplet = {
    left: String(formData.get("coupletLeft") || "").slice(0, 30),
    right: String(formData.get("coupletRight") || "").slice(0, 30),
    horizontal: String(formData.get("coupletHorizontal") || "").slice(0, 8),
  };
  const epitaph = String(formData.get("epitaph") || "").slice(0, 500);
  const hometown = String(formData.get("hometown") || "").slice(0, 100);

  const timeline = String(formData.get("timeline") || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [year, ...rest] = l.split(/[|｜,，]/);
      return { year: (year || "").trim(), event: rest.join("，").trim() };
    });

  const career = String(formData.get("career") || "").slice(0, 60);
  const quote = String(formData.get("quote") || "").slice(0, 120);

  const prevArchive = (hall.archive as Record<string, unknown> | null) ?? {};

  await prisma.memorialHall.update({
    where: { id: hallId },
    data: {
      couplet,
      archive: { ...prevArchive, epitaph, hometown, timeline, career, quote },
    },
  });

  refresh(hallId);
  return { ok: true, message: "已保存，馆内展示已更新" };
}

// ===========================================================================
// 2) 相册管理：URL 添加 / 文件上传（文件走 /api/halls/[id]/upload）/ 删除 / 排序
// ===========================================================================
export async function addHallPhoto(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const url = String(formData.get("url") || "").trim();
  if (!url) return { ok: false, message: "请输入图片链接" };
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) {
    return { ok: false, message: "请输入以 http(s) 开头或以 /uploads/ 开头的地址" };
  }

  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[] } | null) ?? {};
  const photos = archive.photos ?? [];

  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { archive: { ...archive, photos: [...photos, url] } as object },
  });
  refresh(hallId);
  return { ok: true, message: "照片已添加" };
}

export async function removeHallPhoto(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const url = String(formData.get("url") || "");

  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[]; portrait?: string } | null) ?? {};
  const photos = (archive.photos ?? []).filter((p) => p !== url);
  const portrait = archive.portrait === url ? undefined : archive.portrait;

  // 删除前先取文件大小，用于同步递减已用容量（仅本系统托管的文件占容量）
  const freed = await statManagedUpload(url);

  await prisma.memorialHall.update({
    where: { id: hallId },
    data: {
      archive: { ...archive, photos, portrait } as object,
      // 已用字节递减（不扣成负数）。⚠️ 列是 BigInt，decrement 值须传 bigint
      storageUsedBytes: freed > 0 ? { decrement: BigInt(freed) } : undefined,
    },
  });

  // 仅删除系统自己保存的文件，外部链接不动
  await removeHallImage(url);

  refresh(hallId);
  return { ok: true, message: "照片已移除" };
}

/** 把某张照片设为逝者遗像（馆内显著位置展示） */
export async function setHallPortrait(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const url = String(formData.get("url") || "");

  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as Record<string, unknown> | null) ?? {};
  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { archive: { ...archive, portrait: url || undefined } as object },
  });
  refresh(hallId);
  return { ok: true, message: url ? "已设为逝者遗像" : "已取消遗像" };
}

/** 相册排序：把指定照片前移/后移一位 */
export async function moveHallPhoto(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const url = String(formData.get("url") || "");
  const dir = String(formData.get("dir") || "up");

  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[] } | null) ?? {};
  const photos = [...(archive.photos ?? [])];
  const i = photos.indexOf(url);
  if (i < 0) return { ok: false, message: "照片不存在" };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= photos.length) return { ok: true, message: "" };
  [photos[i], photos[j]] = [photos[j], photos[i]];

  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { archive: { ...archive, photos } as object },
  });
  refresh(hallId);
  return { ok: true, message: "顺序已调整" };
}

// ===========================================================================
// ===========================================================================
// 3) 空间装修：保存整份草稿 / 重置 / 积分解锁收费素材
// ===========================================================================
/*
  已删除：applyDecorTemplate / setDecorSlot（2026-10）。

  用户要求「装修完了点保存即完成装修」后，前端改成**草稿 + 一次保存**：
  点模板、换壁纸都只改本地草稿，点「保存并完成装修」才把整份草稿
  一次性交给 saveDecor()。

  这两个旧 action 因此成了死代码，且**留着有害**：
  它们各自只改一个槽位，前端若"保存时逐个回放"会得到非原子写入
  （第 3 件失败 → 库里半套混搭），且 templateId 与 slots 有顺序耦合。
  实现见 lib/decor-save.ts，验收见 scripts/verify-decor-draft-save.mjs。
*/

/** 积分兑换收费素材（单件素材 / 装饰套件 / 整套模板） */
export async function unlockDecor(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const kind = String(formData.get("kind") || "item"); // item | kit | template
  const id = String(formData.get("id") || "");

  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { user, hall } = ctx;

  const isPremium = isPremiumOf(ctx);
  const decor = readDecor(ctx);
  const unlocked = [...(decor.unlocked ?? [])];

  let cost = 0;
  let label = "";
  /** 本次要写入的键（套件会写多个） */
  let keys: string[] = [];

  if (kind === "template") {
    const tpl = findTemplate(id);
    if (!tpl) return { ok: false, message: "模板不存在" };
    if (tpl.tier === "free" || isPremium) return { ok: false, message: "该模板无需兑换" };
    // 建馆赠品：已永久持有，不该再收一次钱
    if ((decor.granted ?? []).includes(tpl.id)) {
      return { ok: true, message: "该模板为建馆赠品，已永久可用" };
    }
    cost = tpl.points ?? 0;
    label = `装修模板「${tpl.name}」`;
    keys = [tplKey(tpl.id)];
  } else if (kind === "kit") {
    const kit = [...KITS, ...CLAN_KITS].find((k) => k.id === id);
    if (!kit) return { ok: false, message: "套件不存在" };
    if (kit.tier === "free" || isPremium) return { ok: false, message: "该套件无需兑换" };
    cost = kit.points ?? 0;
    label = `装饰套件「${kit.name}」`;
    /*
      套件要写 `kit:<id>` **以及**其 includes 里每件素材的 `buy:<id>`。
      只写前者不够 —— 渲染层是按素材 id 判解锁的，
      用户会看到"套件已兑换，但里面的挂饰仍然锁着"。
    */
    keys = [`kit:${kit.id}`, ...kit.includes.map((i) => buyKey(i))];
  } else {
    const item = findDecorItem(id);
    if (!item) return { ok: false, message: "素材不存在" };
    if (item.tier === "free" || isPremium) return { ok: false, message: "该素材无需兑换" };
    /*
      ⚠️ 判据放宽为 `!== "free"`（原先要求 `=== "points"`）。
      因为 buyout 档位（只标货币价、也能积分兑）走的是同一个入口 ——
      用户口径「付费是指可以积分兑换也可以用货币支付」。
      若继续要求 points，buyout 素材点兑换会得到"该素材无需兑换"，
      明明锁着却说不用兑换，是最难解释的一类 bug。
    */
    cost = item.points ?? 0;
    if (cost <= 0) {
      return { ok: false, message: `「${item.name}」仅支持在商城购买，请前往商城解锁` };
    }
    label = `装修素材「${item.name}」`;
    keys = [buyKey(item.id)];
  }

  /*
    幂等口径**含租期**：全部键都在 unlocked 且租期未过才算"已解锁"。
    已过期的键走到这里 = **续费**（再扣一次积分、把租期顺延）——
    这正是"到期后回退免费档、续费即恢复"的恢复入口。
    永久持有的键（entitlements 缺条目）isKeyActive 恒真，行为与改造前一致。
  */
  const entitlements = { ...(decor.entitlements ?? {}) };
  if (keys.every((k) => unlocked.includes(k) && isKeyActive(k, entitlements))) {
    return { ok: true, message: "已解锁，可直接使用" };
  }
  if (cost <= 0) return { ok: false, message: `「${label}」未设积分价，请前往商城购买` };

  const paid = await spendPoints({
    userId: user.id!,
    amount: cost,
    reason: `兑换${label}`,
    refId: hallId,
  });
  if (!paid) {
    return { ok: false, message: `积分不足，兑换「${label}」需要 ${cost} 积分` };
  }

  const next = [...unlocked];
  const nextEnt: Record<string, string | null> = { ...entitlements };
  for (const k of keys) {
    if (!next.includes(k)) next.push(k);
    // 未过期则顺延叠加、已过期则从今天起算（与 premium 订阅续期同构）
    nextEnt[k] = nextExpiry(nextEnt[k]);
  }
  await writeDecor(hallId, hall, { ...decor, unlocked: next, entitlements: nextEnt });
  refresh(hallId);
  return { ok: true, message: `已用 ${cost} 积分解锁${label}` };
}

/** 恢复默认装修 */
export async function resetDecor(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const decor = readDecor(ctx);
  /*
    ⚠️ `granted` 与 `entitlements` 都必须原样带回去。
    这里是"赠品被吃掉"最可能发生的地方：重置时若只保留 unlocked，
    建馆赠品那套模板就从装修方案里被抹掉了 —— 用户点一次「恢复默认」，
    承诺"永久免费"的赠品就凭空消失。verify-decor-grant 锁这条。
    `entitlements` 同理（2026-10 租期制）：重置只还原"装修内容"，
    **租期表是已购权益**，丢了它 = 全部已购素材退化为"曾购但永久"
    —— 表面上看是用户占了便宜，实际是权益记录静默损坏，续费顺延、
    过期判定全都失真。与 unlocked/granted 一并原样保留。
  */
  await writeDecor(hallId, hall, {
    templateId: undefined,
    slots: { ...DEFAULT_DECOR },
    unlocked: decor.unlocked ?? [],
    granted: decor.granted ?? [],
    entitlements: decor.entitlements ?? {},
  });
  refresh(hallId);
  return { ok: true, message: "已恢复默认装修（已解锁的素材与建馆赠品保留）" };
}

/**
 * 保存整份装修草稿 —— **「装修完了点保存即完成装修」**。
 *
 * 这是装修工坊唯一的写入口（购买除外）：
 *   点素材 → 只改前端草稿，不碰库
 *   点这里 → 一次性校验并原子写入，然后算"装修完成"
 *
 * 为什么是"整份草稿一次写入"而不是逐条重放 applyDecorTemplate/setDecorSlot：
 *   ① 原子性：中间任一项不合法就整单拒绝，不会出现"保存失败但改了一半"；
 *   ② 一次往返而不是 N 次（隧道环境下差别明显）；
 *   ③ 不必靠"谁最后跑完"决定 templateId 的存废 —— 顺序耦合太脆。
 *
 * ⚠️ **购买（unlockDecor）不走这里，仍是即时落库。**
 *    花钱/花积分是消费行为，把它做成草稿意味着"用户可以点了一堆再关掉页面
 *    白嫖一次预览" —— 权益必须即时生效，与装修内容分开。
 */
export async function saveDecor(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const raw = String(formData.get("draft") || "");
  const parsed = parseDecorDraft(raw);
  if (!parsed) return { ok: false, message: "装修数据格式有误，请刷新页面重试" };

  const decor = readDecor(ctx);
  const check = checkHallDraft(parsed, {
    isPremium: isPremiumOf(ctx),
    unlocked: decor.unlocked ?? [],
    granted: decor.granted ?? [],
    /*
      租期表必须带上（2026-10 租期制）：不传 = isKeyActive 恒真 =
      过期素材的草稿照样过校验落库，与渲染层（会摘掉过期素材）口径分叉。
    */
    entitlements: decor.entitlements,
  });
  if (!check.ok) return check;

  /*
    写入时只覆盖"装修内容"三件套：
      templateId / slots / updatedAt
    **unlocked 与 granted 一律沿用库里的原值** ——
    它们代表已购权益，绝不能由前端提交的草稿决定。
    早先这里若写成 `{...decor, ...check.draft}` 就是把权益交给了前端，
    一次手搓 POST 就能白嫖全部素材。
  */
  await writeDecor(hallId, hall, {
    ...decor,
    templateId: check.draft.templateId,
    slots: check.draft.slots,
  });
  refresh(hallId);

  const tplName = check.draft.templateId
    ? (findTemplate(check.draft.templateId)?.name ?? check.draft.templateId)
    : "自定义搭配";
  return { ok: true, message: `装修已保存完成 · ${tplName}` };
}

/*
  保存 3D 场景陈设布局（公页馆主拖拽）。
  ⚠️ 与 saveDecor 同源的两条铁律：
    ① 只写 layout，templateId/slots/unlocked/granted **全部沿用库值** ——
       入参里若混进这些字段一律忽略（前端可伪造，权益绝不能由入参决定）；
    ② 独立解析（normalizeLayout），**不能走 parseDecorDraft** —— 它根本不读 layout。
  权限：仅馆主本人（loadHall 已强制 ownerUserId），**不需要 premium** ——
  重排已解锁的陈设不是新权益，订阅卡在这里反而把已买的东西锁住。
*/
export async function saveDecorLayout(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  let rawLayout: unknown;
  try {
    rawLayout = JSON.parse(String(formData.get("layout") || ""));
  } catch {
    return { ok: false, message: "布局数据格式有误" };
  }
  const layout = normalizeLayout(rawLayout);

  const decor = readDecor(ctx);
  await writeDecor(hallId, ctx.hall, { ...decor, layout });
  refresh(hallId);
  return { ok: true, message: layout ? "布局已保存" : "布局已恢复默认" };
}

/** 保存装修备注（题记，展示在馆页装修层） */
export async function saveDecorNote(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const cfg = (hall.templateConfig as Record<string, unknown> | null) ?? {};
  const decor = readDecor(ctx);
  const note = String(formData.get("note") || "").slice(0, 60);

  await prisma.memorialHall.update({
    where: { id: hallId },
    data: {
      templateConfig: {
        ...cfg,
        decor: { ...decor, note, updatedAt: new Date().toISOString() },
      },
    },
  });
  refresh(hallId);
  return { ok: true, message: "题记已保存" };
}

const SLOT_LABEL: Record<DecorSlot, string> = {
  wall: "背景壁纸",
  floor: "地面地纹",
  ornament: "挂饰陈设",
  frame: "遗像相框",
  font: "字体风格",
};

// ===========================================================================
// 社区管理（馆主侧）
// ===========================================================================

/** 重新生成社区邀请码 */
export async function regenerateInviteCode(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const { randomBytes } = await import("node:crypto");
  const code = randomBytes(8).toString("hex");
  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { communityInviteCode: code },
  });
  refresh(hallId);
  return { ok: true, message: `新邀请码：${code}` };
}

/** 移除社区成员（馆主操作） */
export async function removeCommunityMember(formData: FormData) {
  const hallId = String(formData.get("hallId") || "");
  const memberId = String(formData.get("memberId") || "");
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const m = await prisma.communityMember.findUnique({ where: { id: memberId } });
  if (!m || m.hallId !== hallId) return { ok: false, message: "成员不存在" };
  if (m.role === "owner") return { ok: false, message: "不能移除馆主" };

  await prisma.communityMember.delete({ where: { id: memberId } });
  refresh(hallId);
  return { ok: true, message: "已移除" };
}

// ===========================================================================
// 板块顺序（馆主拖拽重排，落库到 MemorialHall.sectionOrder）
// ===========================================================================
export type SectionOrderResult = { ok: boolean; error?: string };

export async function saveHallSectionOrder(
  hallId: string,
  order: string[],
): Promise<SectionOrderResult> {
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (ctx.user.id !== ctx.hall.ownerUserId) {
    return { ok: false, error: "您不是该纪念馆的馆主" };
  }
  // 校验：必须是默认板块集合的一个排列（不丢板块、不加未知板块）
  const def: string[] = [...HALL_DEFAULT_ORDER];
  if (
    !Array.isArray(order) ||
    order.length !== def.length ||
    new Set(order).size !== def.length ||
    !order.every((k) => def.includes(k))
  ) {
    return { ok: false, error: "板块顺序不合法" };
  }
  await prisma.memorialHall.update({
    where: { id: hallId },
    data: { sectionOrder: order },
  });
  refresh(hallId);
  return { ok: true };
}

// ===========================================================================
// 存储空间升级：直接下单（容量包是「指定这一座馆」的，targetHallId 随单落地）
// ===========================================================================
export type StorageOrderResult = { ok: boolean; orderNo?: string; error?: string };

/**
 * 为当前纪念馆创建一张容量包订单并跳转账页。
 *
 * 为什么不做成"跳商城商品页再回来"：容量包是**馆级**的，
 * 必须带上 targetHallId 下单，否则履约时不知道该充进哪座馆。
 * 商城商品页是公共页面（可能未登录、也可能有多个馆），
 * 无法确定目标馆，所以升级入口放在**控制台面板**里、由本 action 一步到位。
 */
export async function createStorageOrder(
  hallId: string,
  planSlug: string,
): Promise<StorageOrderResult> {
  const ctx = await loadHall(hallId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(planSlug in STORAGE_PLANS)) return { ok: false, error: "容量包不存在" };

  const product = await prisma.product.findUnique({
    where: { slug: planSlug },
    select: { id: true, status: true },
  });
  if (!product || product.status !== "active") {
    return { ok: false, error: "该容量包暂不可购买" };
  }

  try {
    const order = await createOrder({
      userId: ctx.user.id!,
      productId: product.id,
      quantity: 1,
      targetHallId: hallId,
      targetKind: "hall",
    });
    return { ok: true, orderNo: order.orderNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "下单失败" };
  }
}
