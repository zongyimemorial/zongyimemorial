import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadProfile, gateProfile, greetingFor } from "@/lib/whisper-service";
import { safeSynthesize, formatLabel } from "@/lib/ai/index";
import { saveGeneratedAudio } from "@/lib/upload";
import { getQuota } from "@/lib/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 独立语音合成接口。
 * 用于「只想听声音」的场景（如朗读一句固定问候），不产生对话轮次消耗。
 *
 * POST JSON: { profileId, text? }
 * 返回 { ok, audioUrl, label }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, code: "auth", message: "请先登录" }, { status: 401 });
  }

  let body: { profileId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad", message: "请求格式不正确" }, { status: 400 });
  }

  const profileId = String(body.profileId || "");
  if (!profileId) {
    return NextResponse.json({ ok: false, code: "bad", message: "缺少装置参数" }, { status: 400 });
  }

  const profile = await loadProfile(profileId);
  const gate = gateProfile(profile);
  if (!gate.ok) {
    return NextResponse.json(gate, { status: gate.code === "not_found" ? 404 : 403 });
  }

  // 语音需有额度（避免绕过配额白嫖 TTS）
  const quota = await getQuota(user.id);
  if (quota.remainingMins <= 0) {
    return NextResponse.json(
      { ok: false, code: "quota", message: "语音时长已用完，可购买按次时长或升级套餐。" },
      { status: 402 },
    );
  }

  const text = String(body.text || "").trim().slice(0, 300) || greetingFor(profile!);

  try {
    const tts = await safeSynthesize({ text, voiceId: profile!.voiceId ?? undefined });
    const audioUrl = await saveGeneratedAudio(tts.buffer, profile!.id, tts.mimeType);
    return NextResponse.json({ ok: true, audioUrl, label: formatLabel(tts.label), text });
  } catch (e) {
    console.error("[whisper/tts] 失败：", e);
    return NextResponse.json(
      { ok: false, code: "error", message: "语音合成暂时不可用" },
      { status: 500 },
    );
  }
}
