import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES, saveWhisperAudio } from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 声音样本上传接口（仅装置馆主本人）。
 *
 * POST multipart/form-data: file=<音频>
 * 返回 { ok, url }
 *
 * 合规前置：声纹属敏感个人信息，必须先存在「未撤回」的家属授权记录。
 * 与 uploadVoiceSample Server Action 保持同一套校验口径。
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true, consent: { select: { revokedAt: true } } },
  });
  if (!profile) {
    return NextResponse.json({ ok: false, error: "追思装置不存在" }, { status: 404 });
  }
  if (profile.ownerUserId !== user.id) {
    return NextResponse.json({ ok: false, error: "只有馆主可以上传样本" }, { status: 403 });
  }
  if (!profile.consent || profile.consent.revokedAt) {
    return NextResponse.json(
      { ok: false, error: "请先完成家属授权，授权通过后才能克隆声音。" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "请选择声音样本文件" }, { status: 400 });
  }
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 MP3 / WAV / M4A / OGG / WebM 音频" },
      { status: 400 },
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { ok: false, error: `样本文件不能超过 ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB` },
      { status: 400 },
    );
  }

  try {
    const url = await saveWhisperAudio(file, id);
    return NextResponse.json({ ok: true, url, bytes: file.size });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
