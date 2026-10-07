import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadProfile, gateProfile, transcribe } from "@/lib/whisper-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 语音样本大小上限（录音一般远小于此） */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/**
 * 语音识别接口。
 *
 * POST multipart/form-data: audio=<录音>, profileId=<装置>
 * 返回 { ok, text, label }
 *
 * 说明：默认使用浏览器端 Web Speech API（免费、低延迟）；
 * 本接口是**降级通道**，用于浏览器不支持时的服务端 ASR。
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, code: "auth", message: "请先登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, code: "bad", message: "请求格式不正确" }, { status: 400 });
  }

  const profileId = String(form.get("profileId") || "");
  const file = form.get("audio");

  if (!profileId) {
    return NextResponse.json({ ok: false, code: "bad", message: "缺少装置参数" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, code: "bad", message: "未收到录音" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, code: "bad", message: "录音过长" }, { status: 400 });
  }

  // 同一套门禁：未开启/未授权的装置不接受识别
  const profile = await loadProfile(profileId);
  const gate = gateProfile(profile);
  if (!gate.ok) {
    return NextResponse.json(gate, { status: gate.code === "not_found" ? 404 : 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await transcribe(buffer, file.type || "audio/webm", profile!.personaName);
    if (!r.text) {
      return NextResponse.json(
        { ok: false, code: "empty", message: "没有听清，请再说一遍" },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, text: r.text, label: r.label });
  } catch (e) {
    console.error("[whisper/asr] 失败：", e);
    return NextResponse.json(
      { ok: false, code: "error", message: "语音识别暂时不可用" },
      { status: 500 },
    );
  }
}
