import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { createReadStream } from "fs";
import path from "path";
import { UPLOAD_ROOT } from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  // 图片
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  // 音频（午夜悄悄话：声音样本 + AI 合成语音）
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
};

/**
 * 上传文件的读取路由。
 *
 * 为什么不直接依赖 public/ 静态托管：Next.js 在生产(next start)下只服务
 * 「构建时已存在」的 public 文件，运行时新写入的图片/音频不会被托管（会 404）。
 * 因此统一走这条路由读盘返回，开发与生产表现一致，
 * 未来切换到对象存储时，只需把这里改成 302 跳转到 CDN 地址即可。
 *
 * 音频支持 Range 请求，否则 <audio> 无法拖动进度条。
 *
 * GET /uploads/:path*
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segs } = await ctx.params;
  const rel = (segs ?? []).join("/");

  // 防目录穿越
  const target = path.normalize(path.join(UPLOAD_ROOT, rel));
  if (!target.startsWith(UPLOAD_ROOT)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext];
  if (!type) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let size: number;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("not a file");
    size = stat.size;
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 文件名含时间戳+随机串，内容不会变更，可长缓存
  const baseHeaders: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  // ---- Range 请求（音频拖动必需）----
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const startRaw = m[1];
      const endRaw = m[2];
      let start: number;
      let end: number;

      if (startRaw === "" && endRaw !== "") {
        // bytes=-N → 最后 N 字节
        const n = Number(endRaw);
        start = Math.max(0, size - n);
        end = size - 1;
      } else {
        start = Number(startRaw || 0);
        end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
      }

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new NextResponse("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }

      const stream = createReadStream(target, { start, end });
      const chunkLen = end - start + 1;

      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(chunkLen),
        },
      });
    }
  }

  // ---- 完整返回 ----
  try {
    const buf = await fs.readFile(target);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
