import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_IMAGE_TYPES, PUBLIC_PREFIX, UPLOAD_ROOT, saveHallImage } from "@/lib/upload";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 证明材料单张上限（合规资料类，10MB 足够） */
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/**
 * 建馆证明材料（承诺书 / 老照片 / 墓址照片等）临时上传接口。
 *
 * 与纪念馆照片上传不同：本接口在「馆尚未创建」时就要用（新建馆表单需先拿到
 * 承诺书 / 辅助材料图片 URL，再随建馆请求一起提交）。因此文件按登录用户隔离
 * 落盘到 `uploads/proofs/<userId>/`，返回可公开访问的相对 URL；owner 补传时
 * 复用同一接口。无需校验纪念馆存储配额（属合规资料，不计容量包）。
 *
 * POST multipart/form-data: file=<图片>
 * 返回 { ok, url }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

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
  if (file.size > MAX_PROOF_BYTES) {
    return NextResponse.json(
      { ok: false, error: `证明材料图片不能超过 ${MAX_PROOF_BYTES / 1024 / 1024}MB` },
      { status: 400 },
    );
  }

  try {
    // 按用户隔离（馆尚未存在时也能用），subdir 固定 proofs
    const url = await saveHallImage(file, user.id, "proofs");
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
