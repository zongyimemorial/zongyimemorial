import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadProfile, gateProfile, talk, recentHistory } from "@/lib/whisper-service";
import { MAX_MESSAGE_CHARS } from "@/lib/whisper";
import { moodSpec } from "@/lib/whisper-mood";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 追思对话接口（文字 / 语音同一入口）。
 *
 * POST JSON: { profileId, text, wantVoice, sessionId?, mood?, moodNote? }
 * 返回 { ok, reply, audioUrl, aiLabel, crisis, immersionNote, quota }
 *
 * 合规要点：
 *   - 每次调用都重新做门禁（授权可能被随时撤回）
 *   - AI 标识由服务端写入并随响应返回，前端必须展示
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, code: "auth", message: "请先登录" }, { status: 401 });
  }

  let body: {
    profileId?: string;
    text?: string;
    wantVoice?: boolean;
    sessionId?: string;
    mood?: string;
    moodNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad", message: "请求格式不正确" }, { status: 400 });
  }

  const profileId = String(body.profileId || "");
  const text = String(body.text || "").trim();
  const wantVoice = !!body.wantVoice;

  if (!profileId) {
    return NextResponse.json({ ok: false, code: "bad", message: "缺少装置参数" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, code: "bad", message: "请输入要说的话" }, { status: 400 });
  }
  if (text.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { ok: false, code: "bad", message: `单条消息最长 ${MAX_MESSAGE_CHARS} 字` },
      { status: 400 },
    );
  }

  const profile = await loadProfile(profileId);
  const gate = gateProfile(profile);
  if (!gate.ok) {
    const status = gate.code === "not_found" ? 404 : gate.code === "disabled" ? 403 : 403;
    return NextResponse.json(gate, { status });
  }

  try {
    const history = await recentHistory(profileId, user.id);
    const result = await talk({
      profile: profile!,
      userId: user.id,
      text,
      wantVoice,
      sessionId: body.sessionId,
      history,
      // 情感标记须为白名单值，非法值一律丢弃（不报错，避免打断对话）
      mood: body.mood && moodSpec(body.mood) ? body.mood : null,
      moodNote: body.moodNote ? String(body.moodNote).slice(0, 100) : null,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 402 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[whisper/chat] 失败：", e);
    return NextResponse.json(
      { ok: false, code: "error", message: "服务暂时不可用，请稍后再试" },
      { status: 500 },
    );
  }
}
