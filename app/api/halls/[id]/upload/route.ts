import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_IMAGE_TYPES, saveHallImage } from "@/lib/upload";
import { effectiveStorageQuota, formatBytes, hasHdUpload, maxImageBytes } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 纪念馆照片上传接口（仅馆主本人）。
 * POST multipart/form-data: file=<图片>
 * 返回 { ok, url }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: hallId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const hall = await prisma.memorialHall.findUnique({
    where: { id: hallId },
    select: {
      id: true,
      ownerUserId: true,
      premiumUntil: true,
      archive: true,
      storageSubBytes: true,
      storageUsedBytes: true,
      storageUntil: true,
    },
  });
  if (!hall) {
    return NextResponse.json({ ok: false, error: "纪念馆不存在" }, { status: 404 });
  }
  if (hall.ownerUserId !== user.id) {
    return NextResponse.json({ ok: false, error: "只有馆主可以上传" }, { status: 403 });
  }

  /* 高级订阅 = 馆级 OR 用户级（与 console/halls actions/page 同口径）。 */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { premiumUntil: true },
  });
  /*
    单张图片上限：**容量包有效 或 高级订阅有效** → 20MB 高清原片。
    判据在 lib/storage.ts 的 hasHdUpload()（单一出口），两个上传 route 共用。
    曾各自手写 `isPremium ? 20MB : 8MB` —— 于是"买了 500GB 容量包
    却传不了一张 12MB 原片"（拒因还写"升级高级订阅"）。
  */
  const hdUpload = hasHdUpload(hall) || hasHdUpload(dbUser);
  // 容量字节配额（单一判据：免费额度 + 已购容量包，不读 premium）
  const quota = effectiveStorageQuota(hall, "hall");
  // storageUsedBytes 在库里是 BigInt，转 number 参与运算（最大 500GB 远小于安全整数）
  const used = Number(hall.storageUsedBytes ?? 0n);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "请选择要上传的图片" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 JPG / PNG / WebP / GIF / AVIF 图片" },
      { status: 400 },
    );
  }
  const maxBytes = maxImageBytes(hall);
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        ok: false,
        error: `单张图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB${
          hdUpload ? "" : "，购买存储容量包可上传 20MB 高清原片"
        }`,
      },
      { status: 400 },
    );
  }

  // 容量字节配额校验（单一判据，不读 premium）
  if (used + file.size > quota) {
    return NextResponse.json(
      {
        ok: false,
        error: `存储空间不足（已用 ${formatBytes(used)} / 共 ${formatBytes(quota)}），升级存储可扩容至 10GB / 50GB / 200GB / 500GB`,
      },
      { status: 400 },
    );
  }

  try {
    const url = await saveHallImage(file, hallId);
    const archive = (hall.archive as Record<string, unknown> | null) ?? {};
    const photos = ((archive.photos as string[] | undefined) ?? []).concat(url);
    await prisma.memorialHall.update({
      where: { id: hallId },
      data: {
        archive: { ...archive, photos } as object,
        // 已用字节递增（与上传文件大小一致；并发由 DB increment 收敛）
        // ⚠️ 列是 BigInt，increment 值必须传 bigint，传 number 会被 Prisma 拒
        storageUsedBytes: { increment: BigInt(file.size) },
      },
    });
    return NextResponse.json({ ok: true, url, count: photos.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
