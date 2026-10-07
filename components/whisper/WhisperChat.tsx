"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AiBadge from "@/components/whisper/AiBadge";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  audioUrl?: string | null;
  aiLabel?: string | null;
  crisis?: boolean;
  pending?: boolean;
};

export type WhisperChatProps = {
  profileId: string;
  personaName: string;
  personTitle: string;
  avatarUrl: string | null;
  mode: string;
  greeting: string;
  /** 是否支持语音（按套餐判断） */
  voiceEnabled: boolean;
  /** 剩余分钟数（仅展示） */
  remainingMins: number;
  /** 单次会话软上限（分钟），到达时给出温和提示 */
  softLimitMins: number;
  /** 会话 id（服务端下发，用于归并日志） */
  initialSessionId?: string;
};

/** 浏览器语音识别（Web Speech API）——零成本、低延迟 */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export default function WhisperChat({
  profileId,
  personaName,
  personTitle,
  avatarUrl,
  mode,
  greeting,
  voiceEnabled,
  remainingMins,
  softLimitMins,
  initialSessionId,
}: WhisperChatProps) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceReply, setVoiceReply] = useState(voiceEnabled);
  const [err, setErr] = useState<string | null>(null);
  const [quotaMins, setQuotaMins] = useState(remainingMins);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [softWarned, setSoftWarned] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef<number>(Date.now());

  // —— 首屏问候 ——
  useEffect(() => {
    setMsgs([
      {
        id: "greeting",
        role: "assistant",
        text: greeting,
        aiLabel: null,
      },
    ]);
  }, [greeting]);

  // —— 浏览器语音识别能力探测 ——
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechOk(false);
      return;
    }
    setSpeechOk(true);
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setInput(text);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
  }, []);

  // —— 自动滚动 ——
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  /** 播放服务端返回的语音 */
  const playAudio = useCallback((url: string) => {
    const el = audioRef.current;
    if (!el) return;
    el.src = url;
    el.play().catch(() => {
      /* 浏览器可能拦截自动播放，用户可手动点播放键 */
    });
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      // 单次会话时长软提醒（合规：不诱导长时间沉浸）
      const elapsedMins = (Date.now() - startedAt.current) / 60000;
      if (elapsedMins >= softLimitMins && !softWarned) {
        setSoftWarned(true);
        setMsgs((m) => [
          ...m,
          {
            id: "soft-" + Date.now(),
            role: "assistant",
            text: `我们已经聊了 ${Math.round(elapsedMins)} 分钟了。想念一个人不必一次说完，随时都可以再来坐坐。`,
            aiLabel: null,
          },
        ]);
      }

      const uid = "u" + Date.now();
      const aid = "a" + Date.now();
      setMsgs((m) => [
        ...m,
        { id: uid, role: "user", text },
        { id: aid, role: "assistant", text: "", pending: true },
      ]);
      setInput("");
      setBusy(true);
      setErr(null);

      try {
        const res = await fetch("/api/whispers/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId,
            text,
            wantVoice: voiceReply,
            sessionId,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reply?: string;
          audioUrl?: string;
          aiLabel?: string;
          crisis?: boolean;
          quota?: { remainingMins: number };
          message?: string;
        };

        if (!res.ok || !data.ok) {
          setMsgs((m) => m.filter((x) => x.id !== aid));
          setErr(data.message || "发送失败，请重试");
          if (res.status === 402) setQuotaMins(0);
          return;
        }

        setMsgs((m) =>
          m.map((x) =>
            x.id === aid
              ? {
                  id: aid,
                  role: "assistant",
                  text: data.reply ?? "",
                  audioUrl: data.audioUrl ?? null,
                  aiLabel: data.aiLabel ?? null,
                  crisis: data.crisis,
                }
              : x,
          ),
        );
        if (typeof data.quota?.remainingMins === "number") setQuotaMins(data.quota.remainingMins);
        if (data.audioUrl) playAudio(data.audioUrl);
      } catch {
        setMsgs((m) => m.filter((x) => x.id !== aid));
        setErr("网络异常，请重试");
      } finally {
        setBusy(false);
      }
    },
    [busy, playAudio, profileId, sessionId, softLimitMins, softWarned, voiceReply],
  );

  function toggleRecord() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (recording) {
      rec.stop();
      setRecording(false);
    } else {
      setInput("");
      try {
        rec.start();
        setRecording(true);
      } catch {
        setRecording(false);
      }
    }
  }

  /** 无 Web Speech API 时：录音上传到服务端 ASR */
  async function recordFallback() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("当前浏览器不支持录音，请改用文字输入。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.set("profileId", profileId);
        fd.set("audio", blob, "rec.webm");
        setBusy(true);
        try {
          const res = await fetch("/api/whispers/asr", { method: "POST", body: fd });
          const d = (await res.json()) as { ok: boolean; text?: string; message?: string };
          if (d.ok && d.text) await send(d.text);
          else setErr(d.message || "没有听清，请再说一遍");
        } catch {
          setErr("语音识别失败，请改用文字输入。");
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      setRecording(true);
      setTimeout(
        () => {
          mr.stop();
          setRecording(false);
        },
        recording ? 8000 : 8000,
      );
      setErr("正在录音，8 秒后自动结束并识别…");
    } catch {
      setErr("无法访问麦克风，请检查浏览器权限。");
      setRecording(false);
    }
  }

  const usedPct =
    quotaMins > 0 || remainingMins > 0
      ? Math.min(100, Math.round((1 - quotaMins / Math.max(1, remainingMins)) * 100))
      : 100;

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white">
      {/* —— 头部：装置身份 —— */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-brand-50/40 px-5 py-3">
        {mode === "avatar" && avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={personaName}
            className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm text-white">
            {personaName.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-brand-900">
            {personaName}
            {personTitle && <span className="ml-2 text-xs font-normal text-brand-400">{personTitle}</span>}
          </p>
          <p className="text-xs text-brand-400">
            剩余语音 {quotaMins} 分钟
            {voiceEnabled ? "" : " · 当前套餐不含语音，仅文字交流"}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-brand-600">
          <input
            type="checkbox"
            checked={voiceReply && voiceEnabled}
            disabled={!voiceEnabled}
            onChange={(e) => setVoiceReply(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-accent-600"
          />
          语音回复
        </label>
      </div>

      {voiceEnabled && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className={"h-full transition-all " + (usedPct > 80 ? "bg-amber-400" : "bg-accent-400")}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      )}

      {/* —— 消息列表 —— */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={"max-w-[78%] " + (m.role === "user" ? "text-right" : "")}>
              <div
                className={
                  "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "rounded-br-sm bg-brand-800 text-white"
                    : m.crisis
                      ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-800"
                      : "rounded-bl-sm bg-gray-100 text-brand-900")
                }
              >
                {m.pending ? (
                  <span className="inline-flex items-center gap-1.5 text-brand-400">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300 [animation-delay:240ms]" />
                    <span className="ml-1 text-xs">正在想你刚才说的话…</span>
                  </span>
                ) : (
                  m.text
                )}
              </div>

              {/* 语音播放器 + AI 标识 */}
              {m.role === "assistant" && !m.pending && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {m.audioUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio src={m.audioUrl} controls className="h-8 max-w-[240px]" />
                  )}
                  <AiBadge label={m.aiLabel} compact={!m.audioUrl} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {err && (
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
          {err}
        </div>
      )}

      {/* —— 输入区 —— */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={recording ? "正在听你说…" : "想对他说点什么？（回车发送，Shift+回车换行）"}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none"
          />
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => (speechOk ? toggleRecord() : recordFallback())}
              disabled={busy}
              title={speechOk ? "语音输入" : "录音后由服务端识别"}
              aria-label={recording ? "停止录音" : "开始语音输入"}
              className={
                "flex items-center gap-1 rounded-md px-3 py-2 text-xs text-white disabled:opacity-50 " +
                (recording ? "animate-pulse bg-red-500" : "bg-brand-600 hover:bg-brand-700")
              }
            >
              {recording ? (
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                  <path
                    d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5 11a7 7 0 0 0 14 0M12 18v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {recording ? "停止" : "语音"}
            </button>
            <button
              type="button"
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="rounded-md bg-brand-800 px-4 py-2 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "…" : "发送"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-brand-400">
          对方由 AI 依据家人上传的生平资料生成，不是真人。对话会被记录保存（不少于 6 个月）。
          {!speechOk && " 若麦克风不可用，请直接用文字输入。"}
        </p>
      </div>
    </div>
  );
}
