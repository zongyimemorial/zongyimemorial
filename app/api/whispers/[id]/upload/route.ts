import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_SPECS, type WhisperPlan } from "@/lib/whisper";
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
 * 克隆资格闸门：订阅档 cloneLimit>0 OR 已支付 ¥10 资格申请（cloneApplied）。
 * 与 uploadVoiceSample Server Action 保持同一套校验口径（方案 B：¥10 是漏斗工本费）。
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    select: {
      id: true,
      ownerUserId: true,
      cloneApplied: true,
      consent: { select: { revokedAt: true } },
    },
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

  // 克隆资格闸门（方案 B）：订阅档自带额度 OR 已申请 ¥10 资格
  const quota = await prisma.whisperQuota.findUnique({ where: { userId: user.id } });
  const plan = (quota?.plan as WhisperPlan) ?? "free";
  const limit = PLAN_SPECS[plan]?.cloneLimit ?? 0;
  if (limit === 0 && !profile.cloneApplied) {
    return NextResponse.json(
      {
        ok: false,
        error: "尚未解锁声音克隆资格：订阅「思念版 / 长夜版」即可克隆，或支付 ¥10 资格申请工本费。",
      },
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
