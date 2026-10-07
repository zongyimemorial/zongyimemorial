"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { obituaryQuotaLeft, consumeObituaryQuota } from "@/lib/obituary";

/**
 * 电子讣告的发布与管理（控制台）。
 *
 * 权限口径：一律 `ownerUserId === 当前用户`。
 * 配额口径：**显式落库**（ObituaryQuota），不查订单 —— 与全站「同一个事实只允许一个判据」一致。
 * 下架口径：只翻转 `status`，**绝不退还配额**（配额在发布时已消耗，下架是隐藏不是退货）。
 */

export type ObituaryResult = {
  ok: boolean;
  message?: string;
  /** 发布成功时回传，供前端跳转到详情页 */
  id?: string;
};

// ---------------------------------------------------------------- 内部工具

/** 解析 <input type="date"> 的值；空/非法 → null（让 Prisma 存 NULL 而非 Invalid Date）。 */
function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 取非空文本（trim + 截断）；空 → null。 */
function str(v: FormDataEntryValue | null, max: number): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/** 载入讣告并校验归属。 */
async function loadObituary(id: string) {
  const user = await getCurrentUser();
  if (!user?.id) return { error: "请先登录" } as const;

  const obituary = await prisma.obituary.findUnique({ where: { id } });
  if (!obituary) return { error: "讣告不存在" } as const;
  if (obituary.ownerUserId !== user.id) return { error: "只有发布者可以管理" } as const;

  return { user, obituary } as const;
}

/** 校验挂馆归属：返回合法 hallId 或抛出可读错误。 */
async function resolveHallId(raw: string, userId: string): Promise<string | null> {
  if (!raw) return null;
  const hall = await prisma.memorialHall.findFirst({
    where: { id: raw, ownerUserId: userId },
    select: { id: true },
  });
  if (!hall) throw new Error("所选纪念馆不存在或不属于你");
  return hall.id;
}

function refresh(id?: string) {
  revalidatePath("/console/obituaries");
  revalidatePath("/console");
  if (id) revalidatePath(`/obituary/${id}`);
}

// ---------------------------------------------------------------- 1. 发布

/**
 * 发布一份电子讣告。
 *
 * 流程：配额校验 → 归属校验 → 存密码哈希 → **事务**（扣配额 + 建讣告）。
 * 扣配额与建讣告放同一事务：否则会出现"扣了配额没建成"或反之。
 */
export async function createObituary(formData: FormData): Promise<ObituaryResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  // 配额校验（显式落库判据）
  const left = await obituaryQuotaLeft(user.id);
  if (left <= 0) {
    return { ok: false, message: "暂无发布配额，请先在商城购买或用积分兑换「电子讣告发布」" };
  }

  const deceasedName = String(formData.get("deceasedName") || "").trim().slice(0, 30);
  if (!deceasedName) return { ok: false, message: "请填写逝者姓名" };

  // 归属馆（可选）+ 防越权挂他人馆
  let hallId: string | null;
  try {
    hallId = await resolveHallId(String(formData.get("hallId") || ""), user.id);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  // 访问密码（选填）：只存 bcrypt 哈希
  const pw = String(formData.get("password") || "");
  const passwordHash = pw ? await bcrypt.hash(pw, 10) : null;

  const created = await prisma
    .$transaction(async (tx) => {
      const uid = user.id!;
      // 条件写扣配额：count===0 即配额不足（并发安全，无 TOCTOU）
      const consumed = await consumeObituaryQuota(
        uid,
        tx as unknown as Parameters<typeof consumeObituaryQuota>[1],
      );
      if (!consumed) throw new Error("配额不足");

      return tx.obituary.create({
        data: {
          ownerUserId: uid,
          hallId,
          deceasedName,
          birthDate: parseDate(formData.get("birthDate")),
          deathDate: parseDate(formData.get("deathDate")),
          biography: str(formData.get("biography"), 2000),
          funeralInfo: str(formData.get("funeralInfo"), 2000),
          contactInfo: str(formData.get("contactInfo"), 500),
          passwordHash,
          isPublic: formData.get("isPublic") === "on",
          allowMessages: formData.get("allowMessages") === "on",
          status: "published",
        },
        select: { id: true },
      });
    })
    .catch(() => null);

  if (!created) return { ok: false, message: "发布失败：配额不足或数据异常" };

  refresh(created.id);
  return { ok: true, id: created.id, message: "讣告已发布" };
}

// ---------------------------------------------------------------- 2. 编辑

/** 更新讣告内容。密码字段：留空=不改，填了=更新哈希。 */
export async function updateObituary(formData: FormData): Promise<ObituaryResult> {
  const id = String(formData.get("obituaryId") || "");
  const ctx = await loadObituary(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const deceasedName = String(formData.get("deceasedName") || "").trim().slice(0, 30);
  if (!deceasedName) return { ok: false, message: "请填写逝者姓名" };

  let hallId: string | null;
  try {
    hallId = await resolveHallId(String(formData.get("hallId") || ""), ctx.user.id!);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const pw = String(formData.get("password") || "");

  await prisma.obituary.update({
    where: { id },
    data: {
      hallId,
      deceasedName,
      birthDate: parseDate(formData.get("birthDate")),
      deathDate: parseDate(formData.get("deathDate")),
      biography: str(formData.get("biography"), 2000),
      funeralInfo: str(formData.get("funeralInfo"), 2000),
      contactInfo: str(formData.get("contactInfo"), 500),
      isPublic: formData.get("isPublic") === "on",
      allowMessages: formData.get("allowMessages") === "on",
      // 留空不改密码；填了才更新（含"清除密码"走单独的 togglePassword）
      ...(pw ? { passwordHash: await bcrypt.hash(pw, 10) } : {}),
    },
  });

  refresh(id);
  return { ok: true, id, message: "已保存" };
}

// ---------------------------------------------------------------- 3. 上下架

/**
 * 上架 / 下架。
 *
 * ⚠️ 下架 ≠ 退配额：只翻转 `status`，绝不 decrement ObituaryQuota.used。
 *    配额在发布时已消耗；下架是"隐藏"，重新发布也**不再扣配额**。
 */
export async function toggleObituaryStatus(formData: FormData): Promise<ObituaryResult> {
  const id = String(formData.get("obituaryId") || "");
  const ctx = await loadObituary(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const next = ctx.obituary.status === "published" ? "unpublished" : "published";
  await prisma.obituary.update({ where: { id }, data: { status: next } });

  refresh(id);
  return {
    ok: true,
    id,
    message: next === "published" ? "已重新发布，公开页恢复可见" : "已下架，公开页暂不可见",
  };
}

// ---------------------------------------------------------------- 4. 删除

/**
 * 删除讣告。
 *
 * ⚠️ 删除**也不退还配额**（与下架同口径）。若想保留内容只是隐藏，请用下架。
 * 这里保留硬删除是给"误发布/内容有误"的兜底，界面上会二次确认。
 */
export async function deleteObituary(formData: FormData): Promise<ObituaryResult> {
  const id = String(formData.get("obituaryId") || "");
  const ctx = await loadObituary(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  await prisma.obituary.delete({ where: { id } });

  refresh();
  return { ok: true, message: "讣告已删除" };
}
