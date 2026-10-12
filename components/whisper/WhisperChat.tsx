"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AiBadge from "@/components/whisper/AiBadge";
import { MOODS, moodLabel } from "@/lib/whisper-mood";

/**
 * 浏览器端录音转码：把 MediaRecorder 产出的 webm/mp4/ogg 解码后，
 * 重采样为 16kHz 单声道，再编码为标准 WAV（16bit PCM）。
 * WAV 是火山 ASR 完全支持且识别最稳的格式，且无需任何外部依赖。
 */
async function blobToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("当前浏览器不支持音频解码");
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered, targetRate);
  } finally {
    void ctx.close();
  }
}

function encodeWav(buffer: AudioBuffer, sampleRate: number): Blob {
  const numCh = buffer.numberOfChannels;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let ch = 0; ch < numCh; ch++) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < numFrames; i++) {
      let s = Math.max(-1, Math.min(1, channel[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

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
  // 情感状态标记（C2）：进对话前先选一个心情，可跳过
  const [mood, setMood] = useState<string | null>(null);
  const [moodNote, setMoodNote] = useState("");
  const [moodAsked, setMoodAsked] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef<number>(Date.now());
  // 服务端 ASR 通道的录音实例 + 自动停止计时器
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            mood: mood ?? undefined,
            moodNote: moodNote || undefined,
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

  /** 转码 WAV 后上传服务端 ASR */
  async function uploadRecording(blob: Blob) {
    setBusy(true);
    setErr("正在识别你说的话…");
    try {
      // 优先转成 16k 单声道 WAV（火山识别最稳）；转码失败则回退原始格式
      let fileBlob = blob;
      let fileName = "rec.webm";
      try {
        fileBlob = await blobToWav(blob, 16000);
        fileName = "rec.wav";
      } catch {
        fileBlob = blob;
        fileName = blob.type.includes("mp4") ? "rec.m4a" : "rec.webm";
      }
      const fd = new FormData();
      fd.set("profileId", profileId);
      fd.set("audio", fileBlob, fileName);
      const res = await fetch("/api/whispers/asr", { method: "POST", body: fd });
      const d = (await res.json()) as { ok: boolean; text?: string; message?: string };
      if (d.ok && d.text) {
        setErr(null);
        await send(d.text);
      } else {
        setErr(d.message || "没有听清，请再说一遍");
      }
    } catch {
      setErr("语音识别失败，请改用文字输入。");
    } finally {
      setBusy(false);
    }
  }

  /** 停止当前录音（手动或超时触发，最终都走 onstop 上传） */
  function stopRecording() {
    if (recTimerRef.current) {
      clearTimeout(recTimerRef.current);
      recTimerRef.current = null;
    }
    const mr = mediaRecRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
  }

  /** 无 Web Speech API 时：本地录音 → 转码 WAV → 上传服务端 ASR */
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("当前浏览器不支持录音，请改用文字输入。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecRef.current = null;
        setRecording(false);
        setErr(null);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        await uploadRecording(blob);
      };
      mr.start();
      setRecording(true);
      setErr("正在录音，点按钮结束（最长 60 秒）…");
      // 安全上限：到点自动停止
      recTimerRef.current = setTimeout(() => {
        recTimerRef.current = null;
        if (mr.state !== "inactive") mr.stop();
      }, 60000);
    } catch {
      setErr("无法访问麦克风，请检查浏览器权限。");
      setRecording(false);
    }
  }

  /** 服务端 ASR 通道：录音中则停止，否则开始 */
  function toggleRecordFallback() {
    if (recording && mediaRecRef.current) stopRecording();
    else void startRecording();
  }

  const usedPct =
    quotaMins > 0 || remainingMins > 0
      ? Math.min(100, Math.round((1 - quotaMins / Math.max(1, remainingMins)) * 100))
      : 100;

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70">
      {/* —— 头部：装置身份 —— */}
      <div className="flex items-center gap-3 border-b border-brand-200 bg-brand-50/40 px-5 py-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm text-white">
          {personaName.slice(0, 1)}
        </div>
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
            className="h-3.5 w-3.5 rounded border-brand-300 text-accent-600"
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

      {/* —— 情感状态标记（C2）：进对话前先选一个心情 —— */}
      {!moodAsked && (
        <div className="border-b border-brand-100 bg-accent-50/40 px-5 py-4">
          <p className="text-xs font-medium text-brand-800">
            今天来的时候，心里是什么感觉？
            <span className="ml-1 font-normal text-brand-400">（选一个，TA 会照着你此刻的心情开口）</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMood(m.key);
                  setMoodAsked(true);
                }}
                className={
                  "rounded-full border px-3.5 py-1.5 text-xs transition " +
                  (mood === m.key
                    ? "border-accent-500 bg-accent-600 text-white"
                    : "border-brand-300 bg-brand-100/70 text-brand-700 hover:border-accent-400")
                }
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMoodAsked(true)}
              className="rounded-full px-3 py-1.5 text-xs text-brand-400 underline hover:text-brand-600"
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {/* 已选心情：轻量回显，可改 */}
      {moodAsked && (
        <div className="flex items-center gap-2 border-b border-brand-200 bg-brand-100/70 px-5 py-2 text-xs text-brand-400">
          <span>
            此刻心情：<b className="text-brand-700">{moodLabel(mood)}</b>
          </span>
          <button
            type="button"
            onClick={() => setMoodAsked(false)}
            className="text-accent-600 underline hover:no-underline"
          >
            改一下
          </button>
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
      <div className="border-t border-brand-200 px-4 py-3">
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
            className="flex-1 resize-none rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none"
          />
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => (speechOk ? toggleRecord() : toggleRecordFallback())}
              disabled={busy}
              title={speechOk ? "语音输入" : "录音后由服务端识别"}
              aria-label={recording ? "停止录音" : "开始语音输入"}
              className={
                "flex items-center gap-1 rounded-md px-3 py-2 text-xs text-white disabled:opacity-50 " +
                (recording ? "animate-pulse bg-red-500" : "bg-brand-600 hover:bg-brand-700")
              }
            >
              {recording ? (
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-100/70" />
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
