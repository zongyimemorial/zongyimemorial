"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermForUser } from "@/lib/permissions";
import { GIFT_SUITE_CHOICES } from "@/lib/memorial";

export interface MemorialDecorResult {
  ok: boolean;
  error?: string;
}

/**
 * 公益馆馆务管理：平台统一配置「装修方案 / 遗像 / 挽联」。
 *
 * 合规隔离原则（与产品方案一致）：
 *   - 公益馆**不开放公众自装修**，所有装修由平台运营在馆务管理页统一配置；
 *   - 仅具备 memorial_review 权限的员工（admin / super_admin / 授权 editor）可访问与提交；
 *   - 公众访问此页会被重定向，零可见、零付费、零商业化。
 *
 * 本 action 同时兼作服务端闸门：即便被直接 POST，也会先校验权限再落库。
 */
export async function updatePublicMemorialDecor(
  _prev: MemorialDecorResult,
  formData: FormData
): Promise<MemorialDecorResult> {
  const user = await getCurrentUser();
  if (!hasPermForUser(user?.role, user?.permissions, "memorial_review")) {
    return { ok: false, error: "无权限：仅公益纪念审核人员可配置馆务" };
  }

  const slug = String(formData.get("slug") || "").trim();
  if (!slug) return { ok: false, error: "参数错误：缺少 slug" };

  const memorial = await prisma.publicMemorial.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!memorial) return { ok: false, error: "纪念堂不存在" };

  const portraitUrl = String(formData.get("portraitUrl") || "").trim();
  const giftSuiteId = String(formData.get("giftSuiteId") || "").trim();
  const left = String(formData.get("coupletLeft") || "").trim();
  const right = String(formData.get("coupletRight") || "").trim();
  const horizontal = String(formData.get("coupletHorizontal") || "").trim();

  // 校验装修方案：必须是平台尊享层三选一
  if (!GIFT_SUITE_CHOICES.some((c) => c.id === giftSuiteId)) {
    return { ok: false, error: "无效的装修方案" };
  }
  // 校验遗像链接（可选，填了才算）
  if (portraitUrl && !/^https?:\/\/.+/i.test(portraitUrl)) {
    return { ok: false, error: "遗像链接需以 http(s):// 开头" };
  }

  // 挽联：仅保留非空字段；全部为空则置 null（不渲染挽联板块）
  const couplet =
    left || right || horizontal
      ? {
          ...(left ? { left } : {}),
          ...(right ? { right } : {}),
          ...(horizontal ? { horizontal } : {}),
        }
      : null;

  await prisma.publicMemorial.update({
    where: { slug },
    data: {
      portraitUrl: portraitUrl || null,
      giftSuiteId,
      // 挽联全空 = 清空（Prisma Json 字段须用 DbNull 表达 SQL NULL，不能直传 JS null）
      couplet: couplet === null ? Prisma.DbNull : couplet,
    },
  });

  // 详情页（含 3D 厅堂 / 挽联 / 赠礼横幅）即时刷新，让平台装修立即生效
  revalidatePath(`/memorial/${slug}`);
  return { ok: true };
}
