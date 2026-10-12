"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints } from "@/lib/points";
import {
  removeHallAssetsDir,
  removeHallImage,
  saveHallImage,
  statManagedUpload,
} from "@/lib/upload";
import {
  CLAN_DEFAULT_DECOR,
  CLAN_KITS,
  CLAN_SLOT_ITEMS,
  findClanDecorItem,
  findClanTemplate,
  normalizeClanDecor,
  type DecorSlot,
  type HallDecor,
} from "@/lib/clan-decor";
import { CLAN_DEFAULT_ORDER } from "@/lib/section-order";
import {
  GRANTED_TEMPLATE_PARTS,
  buyKey,
  isKeyActive,
  nextExpiry,
  normalizeEntitlements,
  normalizeLayout,
  tplKey,
} from "@/lib/hall-decor";
import { checkClanDraft, parseDecorDraft } from "@/lib/decor-save";
import { isPremiumUntil } from "@/lib/premium";
import { createOrder } from "@/lib/orders";
import { STORAGE_PLANS } from "@/lib/storage";
import { MATERIAL_TYPES, normalizeProofs } from "@/lib/hall-review";

// ===========================================================================
// 1) 基本信息（馆主）
// ===========================================================================
/** 编辑宗祠基本信息 */
export async function saveClanHallProfile(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const originPlace = String(formData.get("origin") || "").trim().slice(0, 60);
  const ancestorName = String(formData.get("ancestorName") || "").trim().slice(0, 20);
  const ancestorTitle = String(formData.get("ancestorTitle") || "").trim().slice(0, 30);
  const description = String(formData.get("description") || "").trim().slice(0, 2000);
  const generationPoem = String(formData.get("generationPoem") || "").trim().slice(0, 2000);
  const surname = String(formData.get("surname") || "").trim().slice(0, 10);
  const hallName = String(formData.get("hallName") || "").trim().slice(0, 40);
  const name = String(formData.get("name") || "").trim().slice(0, 20);

  await prisma.clanHall.update({
    where: { id },
    data: {
      ...(surname ? { surname } : {}),
      ...(hallName ? { hallName } : {}),
      ...(name ? { name } : {}),
      origin: originPlace || null,
      ancestorName: ancestorName || null,
      ancestorTitle: ancestorTitle || null,
      description: description || null,
      generationPoem: generationPoem || null,
    },
  });
  refresh(id);
  return { ok: true, message: "已保存，宗祠信息已更新" };
}

/** 提交审核（新建 / 修改后重新送审） */
export async function submitClanHallForReview(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  // 修「重新送审 isPublic:true」瑕疵：送审即回到待审态，未过审前不得公开
  await prisma.clanHall.update({
    where: { id },
    data: { status: "pending", isPublic: false },
  });
  refresh(id);
  return { ok: true, message: "已提交审核，审核通过后将对宗亲公开展示" };
}

/**
 * 特殊申述通道补传材料（owner 自办）。
 * 仅创建者可见期间，owner 在 60 天补传期内提交正式材料 → 置 supplementedAt +
 * isPublic=true，宗祠转公开。材料以「追加/更新」方式并入现有 proofs.materials。
 */
export async function supplementClanHallMaterials(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const id = String(formData.get("id") || "");
  const hall = await prisma.clanHall.findUnique({ where: { id } });
  if (!hall) redirect("/console");
  if (hall.ownerUserId !== user.id) redirect("/console");
  if (hall.reviewChannel !== "appeal" || hall.status !== "active") return;

  const appealTypes = [
    "clan_obituary",
    "clan_old_photo",
    "clan_history_doc",
    "clan_family_record",
  ] as const;
  const existing =
    normalizeProofs(hall.proofs) ??
    ({
      applicantIdCard: "",
      applicantPhone: "",
      relation: "宗亲",
      materials: [] as { type: string; label: string; value?: string; url?: string }[],
    } as const);
  const materials = [...(existing.materials ?? [])];
  for (const type of appealTypes) {
    const value = String(formData.get(`sup_${type}`) || "").trim().slice(0, 200);
    const file = formData.get(`supfile_${type}`);
    let url: string | undefined;
    if (file instanceof File && file.size > 0) {
      try {
        url = await saveHallImage(file, id, "proofs");
      } catch {
        return;
      }
    }
    if (value || url) {
      const item = {
        type,
        label: MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES].label,
        value: value || undefined,
        url: url || undefined,
      };
      const idx = materials.findIndex((m) => m.type === type);
      if (idx >= 0) materials[idx] = item;
      else materials.push(item);
    }
  }

  const proofs = { ...existing, materials };
  await prisma.clanHall.update({
    where: { id },
    data: {
      proofs: proofs as object,
      supplementedAt: new Date(),
      isPublic: true,
    },
  });

  refresh(id);
  revalidatePath(`/clan/halls/${id}`);
  redirect(`/console/clan-halls/${id}?supplemented=1`);
}

// ===========================================================================
// 删除宗祠（祠主行使删除权）
// ===========================================================================
/**
 * 删除宗祠（祠主行使数据删除权）。
 *
 * 删除范围（显式级联清理 + 磁盘清除）：
 *   - ClanHall 本体
 *   - ClanTribute（祭祀 / 消费记录）
 *   - CommunityMember / CommunityPost（宗亲社区）
 *   - ClanActivity（本祠宗族活动，含报名）
 *   - HallReport（建馆审核举报）
 *   - 磁盘 uploads/clan-halls/<id>/ 整棵目录（照片 + 证明材料）
 *
 * 安全：仅祠主本人可删；先落审计日志再删库。
 * 显式清理所有子表，确保无论 schema 级联设置如何，删父表都不会触发外键约束。
 */
export async function deleteClanHall(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const info = await prisma.clanHall.findUnique({
    where: { id },
    select: { name: true, hallName: true },
  });

  // 1) 先落审计日志
  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id!,
      action: `clan_hall_delete:${info?.hallName ?? info?.name ?? id}`,
      entity: "ClanHall",
      entityId: id,
    },
  });

  // 2) 显式清理子表（无论 schema 是否级联）
  await prisma.clanTribute.deleteMany({ where: { clanHallId: id } });
  await prisma.communityMember.deleteMany({ where: { clanHallId: id } });
  await prisma.communityPost.deleteMany({ where: { clanHallId: id } });
  await prisma.clanActivity.deleteMany({ where: { clanHallId: id } });
  await prisma.hallReport.deleteMany({ where: { clanHallId: id } });

  // 3) 磁盘清理（照片 + 证明材料）；失败不影响主流程
  try {
    await removeHallAssetsDir(id, "clan-halls");
  } catch {
    /* 文件层失败不阻塞 */
  }

  // 4) 删本体
  await prisma.clanHall.delete({ where: { id } });

  revalidatePath("/console");
  revalidatePath(`/clan/halls/${id}`);
  redirect("/console?clanHallDeleted=1");
}

/**
 * 切换宗祠公开状态 —— 「下架 / 撤回为私密草稿」的可逆操作（与纪念馆侧 setHallPublic 同构）。
 *
 * 只翻 isPublic：数据全留、磁盘不动；effectivePublic=false → 公页非祠主 notFound()、
 * 列表过滤、SEO noindex，祠主仍可看见与重新公开。先落审计日志再改库，可追溯。
 */
export async function setClanHallPublic(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const isPublic = String(formData.get("isPublic") || "") === "1";
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const info = await prisma.clanHall.findUnique({ where: { id }, select: { hallName: true, name: true } });

  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id!,
      action: isPublic
        ? `clan_hall_republish:${info?.hallName ?? id}`
        : `clan_hall_withdraw:${info?.hallName ?? id}`,
      entity: "ClanHall",
      entityId: id,
    },
  });

  await prisma.clanHall.update({ where: { id }, data: { isPublic } });
  refresh(id);
  revalidatePath(`/clan/halls/${id}`);
  revalidatePath("/console");
  return {
    ok: true,
    message: isPublic ? "已重新公开，宗亲可访问本祠" : "已撤回为私密草稿，仅你可见（数据完整保留）",
  };
}

// ===========================================================================
// 2) 相册管理
// ===========================================================================
async function loadClanHall(
  id: string,
): Promise<
  | { error: string }
  | {
      user: { id?: string; premiumUntil: Date | null };
      hall: {
        id: string;
        ownerUserId: string;
        surname: string;
        premiumUntil: Date | null;
        archive: unknown;
        templateConfig: unknown;
      };
    }
> {
  const user = await getCurrentUser();
  if (!user?.id) return { error: "请先登录" };
  const hall = await prisma.clanHall.findUnique({
    where: { id },
    select: {
      id: true,
      ownerUserId: true,
      surname: true,
      premiumUntil: true,
      archive: true,
      templateConfig: true,
    },
  });
  if (!hall) return { error: "宗祠不存在" };
  if (hall.ownerUserId !== user.id) return { error: "只有宗祠馆主可以编辑" };

  /*
    ⚠️ 必须把**用户级** premiumUntil 一并取回 —— 见 isPremiumOf() 的注释。
    这里只多查一个字段，代价可忽略；漏了它就会重现"UI 说全解锁、保存却失败"。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { premiumUntil: true },
  });
  return { user: { id: user.id, premiumUntil: dbUser?.premiumUntil ?? null }, hall };
}

type ClanHallRow = {
  id: string;
  ownerUserId: string;
  surname: string;
  premiumUntil: Date | null;
  archive: unknown;
  templateConfig: unknown;
};

/**
 * 是否享有高级订阅 —— **馆级 OR 用户级**。
 *
 * ⚠️ 这里曾经只认 `hall.premiumUntil`，而控制台页（`page.tsx`）认的是
 * 「馆级 OR 用户级」→ **同一个事实两个判据**，直接造成"宗祠装修后无法保存"：
 *
 *   用户级订阅有效、馆级为 null 时：
 *     · 页面：premiumActive = true → 全素材显示「已解锁」、
 *            顶部标「高级订阅生效中 · 全部装修素材可用」
 *     · action：isPremiumOf(hall) = false → checkClanDraft 判「尚未解锁」
 *             → 保存被驳回，用户看到的是"点了保存没反应"
 *
 * 产品口径已定：**用户买的订阅覆盖他名下的馆/祠**（与 `(public)/clan/halls/[id]/page.tsx`
 * 的 `userPremium || hallPremium` 一致）。所以这里必须以并集为准。
 *
 * 参数改成 ctx 而不是 hall：调用处无法再"只传馆"而悄悄退回旧语义。
 */
function isPremiumOf(ctx: { user: { premiumUntil: Date | null }; hall: ClanHallRow }) {
  return isPremiumUntil(ctx.user.premiumUntil) || isPremiumUntil(ctx.hall.premiumUntil);
}

function readDecor(ctx: { user: { premiumUntil: Date | null }; hall: ClanHallRow }): HallDecor {
  const cfg = (ctx.hall.templateConfig as { decor?: unknown } | null) ?? {};
  const raw = (cfg.decor ?? {}) as Partial<HallDecor>;
  const unlocked = Array.isArray(raw.unlocked) ? raw.unlocked.map(String) : [];
  const granted = Array.isArray(raw.granted) ? raw.granted.map(String) : [];
  return normalizeClanDecor(
    { ...raw, slots: { ...CLAN_DEFAULT_DECOR, ...(raw.slots ?? {}) } },
    { isPremium: isPremiumOf(ctx), unlocked, granted, entitlements: normalizeEntitlements(raw.entitlements) },
  );
}

async function writeDecor(id: string, hall: ClanHallRow, decor: HallDecor) {
  const cfg = (hall.templateConfig as Record<string, unknown> | null) ?? {};
  await prisma.clanHall.update({
    where: { id },
    data: { templateConfig: { ...cfg, decor: { ...decor, updatedAt: new Date().toISOString() } } },
  });
}

function refresh(id: string) {
  revalidatePath(`/clan/halls/${id}`);
  revalidatePath("/clan/halls");
  revalidatePath(`/console/clan-halls/${id}`);
}

export async function addClanHallPhoto(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const url = String(formData.get("url") || "").trim();
  if (!url) return { ok: false, message: "请输入图片链接" };
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) {
    return { ok: false, message: "请输入以 http(s) 开头或以 /uploads/ 开头的地址" };
  }

  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[] } | null) ?? {};
  const photos = archive.photos ?? [];

  await prisma.clanHall.update({
    where: { id },
    data: { archive: { ...archive, photos: [...photos, url] } as object },
  });
  refresh(id);
  return { ok: true, message: "照片已添加" };
}

export async function removeClanHallPhoto(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const url = String(formData.get("url") || "");

  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[]; portrait?: string } | null) ?? {};
  const photos = (archive.photos ?? []).filter((p) => p !== url);
  const portrait = archive.portrait === url ? undefined : archive.portrait;

  // 删除前先取文件大小，用于同步递减已用容量（仅本系统托管的文件占容量）
  const freed = await statManagedUpload(url);

  await prisma.clanHall.update({
    where: { id },
    data: {
      archive: { ...archive, photos, portrait } as object,
      // 已用字节递减（不扣成负数）。⚠️ 列是 BigInt，decrement 值须传 bigint
      storageUsedBytes: freed > 0 ? { decrement: BigInt(freed) } : undefined,
    },
  });

  await removeHallImage(url);

  refresh(id);
  return { ok: true, message: "照片已移除" };
}

/** 把某张照片设为宗祠封面（祖宗画像 / 正堂照） */
export async function setClanHallPortrait(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const url = String(formData.get("url") || "");

  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as Record<string, unknown> | null) ?? {};
  await prisma.clanHall.update({
    where: { id },
    data: {
      archive: { ...archive, portrait: url || undefined } as object,
      coverImage: url || null,
    },
  });
  refresh(id);
  return { ok: true, message: url ? "已设为宗祠主图" : "已取消主图" };
}

export async function moveClanHallPhoto(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const url = String(formData.get("url") || "");
  const dir = String(formData.get("dir") || "up");

  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const archive = (hall.archive as { photos?: string[] } | null) ?? {};
  const photos = [...(archive.photos ?? [])];
  const i = photos.indexOf(url);
  if (i < 0) return { ok: false, message: "照片不存在" };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= photos.length) return { ok: true, message: "" };
  [photos[i], photos[j]] = [photos[j], photos[i]];

  await prisma.clanHall.update({
    where: { id },
    data: { archive: { ...archive, photos } as object },
  });
  refresh(id);
  return { ok: true, message: "顺序已调整" };
}

// ===========================================================================
// 2) 空间装修：保存整份草稿 / 重置 / 积分解锁收费素材
// ===========================================================================
/*
  已删除：applyClanDecorTemplate / setClanDecorSlot（2026-10）。

  与纪念馆侧同步（见 app/console/halls/[id]/actions.ts 的同名墓碑）。
  用户要求「装修完了点保存即完成装修」后，点模板/换壁纸只改本地草稿，
  点「保存并完成装修」才把整份草稿交给 saveClanDecor() 一次性写入。
  逐槽位回放会非原子（第 3 件失败 → 库里半套混搭）且 templateId 与 slots
  有顺序耦合 —— 所以旧 action 必须删，不能留着给未来的人误用。
  实现见 lib/decor-save.ts，验收见 scripts/verify-decor-draft-save.mjs。
*/

export async function unlockClanDecor(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const kind = String(formData.get("kind") || "item"); // item | kit | template
  const itemId = String(formData.get("id") || "");

  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { user, hall } = ctx;

  const isPremium = isPremiumOf(ctx);
  const decor = readDecor(ctx);
  const unlocked = [...(decor.unlocked ?? [])];

  let cost = 0;
  let label = "";
  let keys: string[] = [];

  if (kind === "template") {
    const tpl = findClanTemplate(itemId);
    if (!tpl) return { ok: false, message: "模板不存在" };
    if (tpl.tier === "free" || isPremium) return { ok: false, message: "该模板无需兑换" };
    // 建馆赠品已永久持有，不该再收一次钱
    if ((decor.granted ?? []).includes(tpl.id)) {
      return { ok: true, message: "该模板为建馆赠品，已永久可用" };
    }
    cost = tpl.points ?? 0;
    label = `宗祠模板「${tpl.name}」`;
    keys = [tplKey(tpl.id)];
  } else if (kind === "kit") {
    const kit = CLAN_KITS.find((k) => k.id === itemId);
    if (!kit) return { ok: false, message: "套件不存在" };
    if (kit.tier === "free" || isPremium) return { ok: false, message: "该套件无需兑换" };
    cost = kit.points ?? 0;
    label = `宗祠装饰套件「${kit.name}」`;
    // 套件要写 kit: 键**以及**每件素材的 buy: 键，否则"套件已买、里面的挂饰还锁着"
    keys = [`kit:${kit.id}`, ...kit.includes.map((i) => buyKey(i))];
  } else {
    const item = findClanDecorItem(itemId);
    if (!item) return { ok: false, message: "素材不存在" };
    if (item.tier === "free" || isPremium) return { ok: false, message: "该素材无需兑换" };
    // 判据放宽到 `!== "free"`：buyout 档位也必须能积分兑（用户口径：两种支付方式都可用）
    cost = item.points ?? 0;
    if (cost <= 0) {
      return { ok: false, message: `「${item.name}」仅支持在商城购买，请前往商城解锁` };
    }
    label = `宗祠素材「${item.name}」`;
    keys = [buyKey(item.id)];
  }

  /*
    幂等口径**含租期**（与纪念馆侧 unlockDecor 同构）：
    全部键都在 unlocked 且租期未过才算"已解锁"；已过期的键继续走
    扣分 = **续费**，把租期顺延 —— "到期回退免费档、续费即恢复"的恢复入口。
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
    refId: id,
  });
  if (!paid) return { ok: false, message: `积分不足，兑换「${label}」需要 ${cost} 积分` };

  const next = [...unlocked];
  const nextEnt: Record<string, string | null> = { ...entitlements };
  for (const k of keys) {
    if (!next.includes(k)) next.push(k);
    nextEnt[k] = nextExpiry(nextEnt[k]);
  }
  await writeDecor(id, hall, { ...decor, unlocked: next, entitlements: nextEnt });
  refresh(id);
  return { ok: true, message: `已用 ${cost} 积分解锁${label}` };
}

/**
 * 保存整份宗祠装修草稿 —— 与纪念馆侧同语义（「装修完了点保存即完成装修」）。
 * 逐条理由见 `app/console/halls/[id]/actions.ts` 的 saveDecor 注释，此处不重复。
 *
 * ⚠️ 同纪念馆：只覆盖 templateId / slots / updatedAt，
 *    `unlocked` 与 `granted` 一律沿用库里原值 —— 权益不能由前端草稿决定。
 */
export async function saveClanDecor(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const raw = String(formData.get("draft") || "");
  const parsed = parseDecorDraft(raw);
  if (!parsed) return { ok: false, message: "装修数据格式有误，请刷新页面重试" };

  const decor = readDecor(ctx);
  const check = checkClanDraft(parsed, {
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

  await writeDecor(id, hall, {
    ...decor,
    templateId: check.draft.templateId,
    slots: check.draft.slots,
  });
  refresh(id);

  const tplName = check.draft.templateId
    ? (findClanTemplate(check.draft.templateId)?.name ?? check.draft.templateId)
    : "自定义搭配";
  return { ok: true, message: `装修已保存完成 · ${tplName}` };
}

/*
  保存 3D 场景陈设布局（公页馆主拖拽）。铁律与纪念馆侧 saveDecorLayout 相同：
  只写 layout，其余字段沿用库值；独立解析（normalizeLayout），不走 parseDecorDraft；
  仅馆主本人，不需要 premium。
*/
export async function saveClanDecorLayout(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  let rawLayout: unknown;
  try {
    rawLayout = JSON.parse(String(formData.get("layout") || ""));
  } catch {
    return { ok: false, message: "布局数据格式有误" };
  }
  const layout = normalizeLayout(rawLayout);

  const decor = readDecor(ctx);
  await writeDecor(id, ctx.hall, { ...decor, layout });
  refresh(id);
  return { ok: true, message: layout ? "布局已保存" : "布局已恢复默认" };
}

export async function resetClanDecor(formData: FormData) {
  const id = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { hall } = ctx;

  const decor = readDecor(ctx);
  /*
    ⚠️ `granted` 与 `entitlements` 都必须原样带回（同纪念馆侧，见其注释）：
    前者丢了 = 建馆赠品被「恢复默认」抹掉；
    后者丢了 = 全部租期记录静默损坏（续费顺延、过期判定全失真）。
    「恢复默认」只还原装修内容，已购权益一个字节都不能动。
  */
  await writeDecor(id, hall, {
    templateId: undefined,
    slots: { ...CLAN_DEFAULT_DECOR },
    unlocked: decor.unlocked ?? [],
    granted: decor.granted ?? [],
    entitlements: decor.entitlements ?? {},
  });
  refresh(id);
  return { ok: true, message: "已恢复默认装修（已解锁的素材与建馆赠品保留）" };
}

export type ActionResult = {
  ok: boolean;
  message?: string;
  needUnlock?: { kind: string; id: string; slot?: string; points: number };
};

const CLAN_SLOT_LABEL: Record<DecorSlot, string> = {
  wall: "墙面材质",
  floor: "地面铺装",
  ornament: "挂饰陈设",
  frame: "相框",
  font: "字体风格",
};

// ===========================================================================
// 社区管理（宗祠馆主侧）
// ===========================================================================

/** 重新生成社区邀请码 */
export async function regenerateClanInviteCode(formData: FormData) {
  const clanHallId = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(clanHallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const { randomBytes } = await import("node:crypto");
  const code = randomBytes(8).toString("hex");
  await prisma.clanHall.update({
    where: { id: clanHallId },
    data: { communityInviteCode: code },
  });
  refresh(clanHallId);
  return { ok: true, message: `新邀请码：${code}` };
}

/** 移除社区成员（宗祠馆主操作） */
export async function removeClanCommunityMember(formData: FormData) {
  const clanHallId = String(formData.get("clanHallId") || "");
  const memberId = String(formData.get("memberId") || "");
  const ctx = await loadClanHall(clanHallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const m = await prisma.communityMember.findUnique({ where: { id: memberId } });
  if (!m || m.clanHallId !== clanHallId) return { ok: false, message: "成员不存在" };
  if (m.role === "owner") return { ok: false, message: "不能移除馆主" };

  await prisma.communityMember.delete({ where: { id: memberId } });
  refresh(clanHallId);
  return { ok: true, message: "已移除" };
}

// ===========================================================================
// 板块顺序（祠主拖拽重排，落库到 ClanHall.sectionOrder）
// ===========================================================================
export type SectionOrderResult = { ok: boolean; error?: string };

export async function saveClanHallSectionOrder(
  clanHallId: string,
  order: string[],
): Promise<SectionOrderResult> {
  const ctx = await loadClanHall(clanHallId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (ctx.user.id !== ctx.hall.ownerUserId) {
    return { ok: false, error: "您不是该宗祠的祠主" };
  }
  // 校验：必须是默认板块集合的一个排列（不丢板块、不加未知板块）
  const def: string[] = [...CLAN_DEFAULT_ORDER];
  if (
    !Array.isArray(order) ||
    order.length !== def.length ||
    new Set(order).size !== def.length ||
    !order.every((k) => def.includes(k))
  ) {
    return { ok: false, error: "板块顺序不合法" };
  }
  await prisma.clanHall.update({
    where: { id: clanHallId },
    data: { sectionOrder: order },
  });
  refresh(clanHallId);
  return { ok: true };
}

// ===========================================================================
// 存储空间升级：直接下单（容量包是「指定这一座祠」的，targetKind="clan"）
// ===========================================================================
export type StorageOrderResult = { ok: boolean; orderNo?: string; error?: string };

/**
 * 为当前宗祠创建一张容量包订单并跳转账页。
 * 与纪念馆侧同构 —— 容量包是**祠级**的，必须带 targetHallId + targetKind 下单。
 */
export async function createClanStorageOrder(
  clanHallId: string,
  planSlug: string,
): Promise<StorageOrderResult> {
  const ctx = await loadClanHall(clanHallId);
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
      targetHallId: clanHallId,
      targetKind: "clan",
    });
    return { ok: true, orderNo: order.orderNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "下单失败" };
  }
}

// ===========================================================================
// 宗族活动：祠主发布本族活动（先审后显）
// ===========================================================================
const CLAN_ACTIVITY_KINDS = ["祭祖大典", "宗亲联谊", "修谱研讨", "家族议事"];

/**
 * 祠主在控制台发布本祠活动。归属校验走 loadClanHall（仅祠主）；
 * 需实名；新活动一律 reviewStatus="pending"，由平台在「内容审核」通过后才在公页公开。
 */
export async function createClanActivity(formData: FormData) {
  const clanHallId = String(formData.get("clanHallId") || "");
  const ctx = await loadClanHall(clanHallId);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const dbUser = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { idVerified: true },
  });
  if (!dbUser?.idVerified) {
    return { ok: false, message: "发布活动需先完成实名认证（控制台 → 账号设置）" };
  }

  const title = String(formData.get("title") || "").trim().slice(0, 80);
  const location = String(formData.get("location") || "").trim().slice(0, 120);
  const startAtRaw = String(formData.get("startAt") || "").trim();
  if (!title) return { ok: false, message: "请填写活动标题" };
  if (!location) return { ok: false, message: "请填写活动地点" };
  if (!startAtRaw) return { ok: false, message: "请选择活动时间" };
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return { ok: false, message: "活动时间格式不正确" };

  const kindRaw = String(formData.get("kind") || "");
  const kind = CLAN_ACTIVITY_KINDS.includes(kindRaw) ? kindRaw : "家族议事";
  const capacity = Math.max(1, Number(formData.get("capacity") || 100) || 100);

  await prisma.clanActivity.create({
    data: {
      title,
      kind,
      surname: ctx.hall.surname || null,
      location,
      onlineLink: String(formData.get("onlineLink") || "").trim() || null,
      coverImage: String(formData.get("coverImage") || "").trim() || null,
      description: String(formData.get("description") || "").trim().slice(0, 2000) || null,
      startAt,
      capacity,
      clanHallId,
      createdByUserId: ctx.user.id!,
      reviewStatus: "pending",
    },
  });

  refresh(clanHallId);
  revalidatePath("/clan/activities");
  revalidatePath("/clan");
  return { ok: true, message: "活动已提交审核，管理员通过后即在「宗族活动」公开（下方可查看审核状态）" };
}
