"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  slugify,
  type MemorialCategory,
  PUBLIC_WREATH_MAX,
  PUBLIC_WREATH_TTL_MS,
  countActivePublicWreaths,
  freeOfferingType,
} from "@/lib/memorial";

const CATEGORIES: MemorialCategory[] = ["CELEBRITY", "HEROIC", "GOOD_DEED", "NATIONAL_HERO"];

export interface SubmitResult {
  ok: boolean;
  errors?: string[];
  /** 申请人管理凭证：凭它免登录撤回/删除本申请（及后续上线的纪念堂） */
  token?: string;
}

/**
 * 家属申请创建公益纪念堂。
 *
 * 合规闸门（与产品方案五道防线对齐）：
 *   - 必填逝者姓名 / 类别 / 申请人信息 / 关系
 *   - 必须勾选同意《家属授权书》（consentConfirmed 强制为 true）
 *   - 必须提供权威来源链接（官方通报 / 主流媒体报道 / 称号评定文书）
 * 任一不满足 → 返回 errors，不落库。
 */
export async function submitApplication(formData: FormData): Promise<SubmitResult> {
  const deceasedName = String(formData.get("deceasedName") || "").trim();
  const category = String(formData.get("category") || "") as MemorialCategory;
  const applicantName = String(formData.get("applicantName") || "").trim();
  const applicantRelation = String(formData.get("applicantRelation") || "").trim();
  const applicantContact = String(formData.get("applicantContact") || "").trim();
  const consent =
    formData.get("consentConfirmed") === "on" || formData.get("consentConfirmed") === "true";
  const honorTitle = String(formData.get("honorTitle") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  const story = String(formData.get("story") || "").trim();
  const sourceUrl = String(formData.get("sourceUrl") || "").trim();
  const birthRaw = String(formData.get("birthYear") || "").trim();
  const deathRaw = String(formData.get("deathYear") || "").trim();

  const errors: string[] = [];
  if (!deceasedName) errors.push("请填写逝者姓名");
  if (!CATEGORIES.includes(category)) errors.push("请选择纪念类别");
  if (!applicantName) errors.push("请填写申请人姓名");
  if (!applicantRelation) errors.push("请填写与逝者关系");
  if (!applicantContact) errors.push("请填写联系方式");
  if (!consent) errors.push("提交前须阅读并勾选同意《家属授权书》");
  if (!sourceUrl) errors.push("请提供权威来源链接（官方通报 / 主流媒体报道 / 称号评定文书）");
  if (!honorTitle) errors.push("请填写一句话称号");
  if (!summary) errors.push("请填写事迹简介");
  if (!story) errors.push("请填写事迹详情");
  if (errors.length) return { ok: false, errors };

  const birthYear = birthRaw ? Number(birthRaw) : null;
  const deathYear = deathRaw ? Number(deathRaw) : null;

  // 申请人管理凭证：48 位 hex 随机串，免登录撤回/删除用，不可猜测。
  const manageToken = randomBytes(24).toString("hex");

  await prisma.publicMemorialApplication.create({
    data: {
      deceasedName,
      category,
      applicantName,
      applicantRelation,
      applicantContact,
      consentConfirmed: true,
      honorTitle,
      summary,
      story,
      sourceUrl,
      birthYear: birthYear && !Number.isNaN(birthYear) ? birthYear : null,
      deathYear: deathYear && !Number.isNaN(deathYear) ? deathYear : null,
      status: "PENDING",
      manageToken,
    },
  });

  revalidatePath("/admin/memorial-review");
  return { ok: true, token: manageToken };
}

/** 公众献花点亮（匿名计数，无内容）。返回最新点亮数。 */
export async function lightMemorial(
  slug: string
): Promise<{ ok: boolean; lightCount?: number }> {
  if (!slug) return { ok: false };
  const m = await prisma.publicMemorial.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true },
  });
  if (!m) return { ok: false };
  const updated = await prisma.publicMemorial.update({
    where: { id: m.id },
    data: { lightCount: { increment: 1 } },
  });
  revalidatePath(`/memorial/${slug}`);
  return { ok: true, lightCount: updated.lightCount };
}

/**
 * 公众留言（先审后发）：落库即 status=PENDING，管理员在审核台放行后才公开。
 */
export async function postMemorialMessage(
  slug: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const content = String(formData.get("content") || "").trim();
  const nicknameRaw = String(formData.get("nickname") || "").trim();
  if (!slug) return { ok: false, error: "参数错误" };
  if (!content) return { ok: false, error: "请填写留言内容" };
  const m = await prisma.publicMemorial.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true },
  });
  if (!m) return { ok: false, error: "纪念堂不存在或已下架" };
  await prisma.publicMemorialMessage.create({
    data: {
      memorialId: m.id,
      nickname: nicknameRaw.slice(0, 20) || "匿名缅怀者",
      content: content.slice(0, 500),
      status: "PENDING",
    },
  });
  revalidatePath(`/memorial/${slug}`);
  return { ok: true };
}

/**
 * 公众免费敬献大花圈（平台提供，免登录、免付费）。
 *
 * 规则（与产品口径一致）：
 *   - 同馆同时最多 2 个有效花圈（写入侧再次校验，前端仅做前置提示）；
 *   - 祭献后陈列 3 天，到期读侧懒清理自动消失；
 *   - 不绑定用户 / 订单，完全免费。
 */
export async function offerPublicWreath(
  slug: string,
  message?: string,
  nickname?: string
): Promise<{ ok: boolean; error?: string; activeCount?: number }> {
  if (!slug) return { ok: false, error: "参数错误" };
  const m = await prisma.publicMemorial.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true },
  });
  if (!m) return { ok: false, error: "纪念堂不存在或已下架" };

  const active = await countActivePublicWreaths(m.id);
  if (active >= PUBLIC_WREATH_MAX) {
    return { ok: false, error: "花圈位已满（同时最多 2 个），请稍后再献", activeCount: active };
  }

  const msg = (message || "").trim().slice(0, 60);
  const nick = (nickname || "").trim().slice(0, 20);
  await prisma.publicMemorialWreath.create({
    data: {
      memorialId: m.id,
      nickname: nick || null,
      message: msg || null,
      expiresAt: new Date(Date.now() + PUBLIC_WREATH_TTL_MS),
    },
  });
  revalidatePath(`/memorial/${slug}`);
  return { ok: true, activeCount: active + 1 };
}

/**
 * 公众免费祭品（平台免费祭品，免登录、随时可献、无每日上限）。
 * 与纪念馆「每日免费祭品」同源，但面向公众全开放。
 */
export async function offerPublicFree(
  slug: string,
  type: string
): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!slug) return { ok: false, error: "参数错误" };
  const def = freeOfferingType(type);
  const m = await prisma.publicMemorial.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true },
  });
  if (!m) return { ok: false, error: "纪念堂不存在或已下架" };

  await prisma.$transaction([
    prisma.publicMemorialOffering.create({
      data: { memorialId: m.id, type: def.type, label: def.label },
    }),
    prisma.publicMemorial.update({
      where: { id: m.id },
      data: { offeringCount: { increment: 1 } },
    }),
  ]);
  revalidatePath(`/memorial/${slug}`);
  return { ok: true, count: undefined };
}
