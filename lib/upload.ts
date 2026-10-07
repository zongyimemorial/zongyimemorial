import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 纪念馆照片存储。
 *
 * 当前实现：本地文件系统（public/uploads/halls/<hallId>/）。
 * 生产环境可切换到对象存储（腾讯云 COS / 阿里云 OSS），
 * 只需实现同样的 save() 接口并改由 OSS SDK 上传、返回 CDN 地址。
 */

export const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
export const PUBLIC_PREFIX = "/uploads";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

/**
 * 单张图片上限（字节）。
 *
 * ⚠️ 数值定义已**迁到 `lib/storage.ts`**（那里是"谁能传高清原片"的唯一判据，
 * 见 `hasHdUpload()`）。这里保留旧名字只是别名转出，避免社区上传 route 等
 * 调用点被一次性打断。
 * 新代码请用 `maxImageBytes(hall)` / `hasHdUpload(hall)`，别再用这两个常量
 * 手写 `isPremium ? MAX_BYTES_PREMIUM : MAX_BYTES_FREE`。
 */
export { MAX_BYTES_STD as MAX_BYTES_FREE, MAX_BYTES_HD as MAX_BYTES_PREMIUM } from "@/lib/storage";

export const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

/** 允许的视频类型（社区帖子附视频） */
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
];

export const VIDEO_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/** 社区视频上传上限 50MB（隧道下可能传不完，引导优先用 URL 嵌入） */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function safeExt(file: File): string {
  const fromType = EXT_BY_TYPE[file.type];
  if (fromType) return fromType;
  const raw = path.extname(file.name || "").toLowerCase();
  return /^\.(jpe?g|png|webp|gif|avif)$/.test(raw) ? raw : "";
}

export function safeVideoExt(file: File): string {
  const fromType = VIDEO_EXT_BY_TYPE[file.type];
  if (fromType) return fromType;
  const raw = path.extname(file.name || "").toLowerCase();
  return /^\.(mp4|webm)$/.test(raw) ? raw : "";
}

/**
 * 保存一张图片到本地磁盘，返回可公开访问的相对路径。
 * @param file  上传的文件
 * @param hallId 场馆 id，用于隔离目录
 * @param subdir 目录前缀，默认 "halls"（纪念馆）；宗祠传 "clan-halls"
 */
export async function saveHallImage(
  file: File,
  hallId: string,
  subdir: string = "halls",
): Promise<string> {
  const ext = safeExt(file);
  if (!ext) throw new Error("仅支持 JPG / PNG / WebP / GIF / AVIF 图片");

  const safeDir = /^[a-z0-9-]+$/.test(subdir) ? subdir : "halls";
  const dir = path.join(UPLOAD_ROOT, safeDir, hallId);
  await fs.mkdir(dir, { recursive: true });

  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, name), buf);

  return `${PUBLIC_PREFIX}/${safeDir}/${hallId}/${name}`;
}

/**
 * 保存社区帖子附带的视频文件到本地磁盘。
 * 路径模式与图片一致，但 subdir 固定为 "community"。
 */
export async function saveCommunityVideo(file: File, ownerId: string): Promise<string> {
  const ext = safeVideoExt(file);
  if (!ext) throw new Error("仅支持 MP4 / WebM 视频");
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`视频不能超过 ${MAX_VIDEO_BYTES / 1024 / 1024}MB`);

  const safeDir = "community";
  const dir = path.join(UPLOAD_ROOT, safeDir, ownerId);
  await fs.mkdir(dir, { recursive: true });

  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, name), buf);

  return `${PUBLIC_PREFIX}/${safeDir}/${ownerId}/${name}`;
}

/** 由本系统管理的图片目录前缀（纪念馆 + 宗祠 + 社区等） */
export const MANAGED_UPLOAD_PREFIXES = [
  `${PUBLIC_PREFIX}/halls/`,
  `${PUBLIC_PREFIX}/clan-halls/`,
  `${PUBLIC_PREFIX}/community/`,
  `${PUBLIC_PREFIX}/whispers/`,
];

/* ============================================================
 * 午夜悄悄话：音频上传与 AI 生成音频落盘
 * ============================================================ */

/** 允许的音频类型（声音样本） */
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg", // mp3
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/mp4", // m4a
  "audio/x-m4a",
  "audio/aac",
];

export const EXT_BY_AUDIO_TYPE: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
};

/** 声音样本上限：20MB（约 20 秒高码率音频，足够 5 秒克隆样本） */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export function safeAudioExt(file: File): string {
  const fromType = EXT_BY_AUDIO_TYPE[file.type];
  if (fromType) return fromType;
  const raw = path.extname(file.name || "").toLowerCase();
  return /^\.(mp3|wav|webm|ogg|m4a|aac)$/.test(raw) ? raw : "";
}

/**
 * 保存用户上传的声音样本（用于声音克隆）。
 * 与 saveHallImage 分属独立函数，避免相互影响。
 */
export async function saveWhisperAudio(file: File, profileId: string): Promise<string> {
  const ext = safeAudioExt(file);
  if (!ext) throw new Error("仅支持 MP3 / WAV / M4A / OGG / WebM 音频");

  const dir = path.join(UPLOAD_ROOT, "whispers", profileId);
  await fs.mkdir(dir, { recursive: true });

  const name = `sample-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, name), buf);

  return `${PUBLIC_PREFIX}/whispers/${profileId}/${name}`;
}

/**
 * 保存 AI 生成的音频（TTS 结果）。
 * 自动按当前月份分目录，便于后续按留存策略清理。
 */
export async function saveGeneratedAudio(
  buffer: Buffer,
  profileId: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.includes("wav")
    ? ".wav"
    : mimeType.includes("ogg")
      ? ".ogg"
      : mimeType.includes("webm")
        ? ".webm"
        : ".mp3";

  const now = new Date();
  const bucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(UPLOAD_ROOT, "whispers", profileId, "tts", bucket);
  await fs.mkdir(dir, { recursive: true });

  const name = `tts-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await fs.writeFile(path.join(dir, name), buffer);

  return `${PUBLIC_PREFIX}/whispers/${profileId}/tts/${bucket}/${name}`;
}

/** 删除一张由本系统保存的图片或音频（忽略外部链接与不存在的情况） */
export async function removeHallImage(url: string): Promise<void> {
  const prefix = MANAGED_UPLOAD_PREFIXES.find((p) => url.startsWith(p));
  if (!prefix) return; // 外部链接不处理
  const rel = url.slice(PUBLIC_PREFIX.length + 1); // <subdir>/<id>/<name>
  const target = path.join(UPLOAD_ROOT, rel);
  // 防目录穿越
  if (!target.startsWith(UPLOAD_ROOT)) return;
  try {
    await fs.unlink(target);
  } catch {
    /* 文件不存在时忽略 */
  }
}

/**
 * 返回某张由本系统管理的图片在磁盘上的字节数（外部链接 / 不存在 → 0）。
 * 用于删除时同步递减对应馆的 `storageUsedBytes`，避免容量只增不减。
 */
export async function statManagedUpload(url: string): Promise<number> {
  const prefix = MANAGED_UPLOAD_PREFIXES.find((p) => url.startsWith(p));
  if (!prefix) return 0; // 外部链接不占本平台存储
  const rel = url.slice(PUBLIC_PREFIX.length + 1);
  const target = path.join(UPLOAD_ROOT, rel);
  if (!target.startsWith(UPLOAD_ROOT)) return 0; // 防目录穿越
  try {
    const st = await fs.stat(target);
    return st.size;
  } catch {
    return 0;
  }
}
