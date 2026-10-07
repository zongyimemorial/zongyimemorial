import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isCommunityMember } from "@/lib/community";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_BYTES_FREE,
  MAX_BYTES_PREMIUM,
  ALLOWED_VIDEO_TYPES,
  MAX_VIDEO_BYTES,
  saveHallImage,
  saveCommunityVideo,
} from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 社区帖子附件上传接口（仅社区成员可用）。
 *
 * POST multipart/form-data:
 *   file=<图片或视频>
 *   hallId=<场馆id> 或 clanHallId=<宗祠id>
 *   kind=image | video
 *
 * 返回 { ok, url, type }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const form = await req.formData();
  const hallId = String(form.get("hallId") || "");
  const clanHallId = String(form.get("clanHallId") || "");
  const kind = String(form.get("kind") || "image");
  const file = form.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ ok: false, error: "未收到文件" }, { status: 400 });
  }

  const scope = hallId ? { hallId } : clanHallId ? { clanHallId } : null;
  if (!scope) {
    return NextResponse.json({ ok: false, error: "缺少场馆 id" }, { status: 400 });
  }

  // 成员校验：只有社区成员才能上传
  const ok = await isCommunityMember(user.id, scope);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "你不是该社区成员" }, { status: 403 });
  }

  const ownerId = hallId || clanHallId;

  try {
    if (kind === "video") {
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        return NextResponse.json({ ok: false, error: "仅支持 MP4 / WebM 视频" }, { status: 415 });
      }
      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { ok: false, error: `视频不能超过 ${MAX_VIDEO_BYTES / 1024 / 1024}MB` },
          { status: 413 },
        );
      }
      const url = await saveCommunityVideo(file, ownerId);
      return NextResponse.json({ ok: true, url, type: "video" });
    }

    // 图片
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "不支持的图片格式" }, { status: 415 });
    }
    const maxBytes = MAX_BYTES_FREE;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `图片不能超过 ${maxBytes / 1024 / 1024}MB` },
        { status: 413 },
      );
    }
    const url = await saveHallImage(file, ownerId, "community");
    return NextResponse.json({ ok: true, url, type: "image" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
