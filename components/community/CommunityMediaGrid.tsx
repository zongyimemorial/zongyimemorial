/**
 * 社区帖子附件网格（图片 + 视频）。
 *
 * 图片点击放大（简易 lightbox）需要客户端交互 → 用一个小客户端 wrapper。
 */
export type MediaItem = { type: "image" | "video"; url: string };

/**
 * 识别视频 URL 类型并返回嵌入 HTML。
 * 支持 B站（BV/av）、YouTube（watch/youtu.be）、本站上传（/uploads/）。
 */
function videoEmbed(url: string): { kind: "iframe" | "video" | "link"; src?: string; text?: string } {
  // B站
  const bv = url.match(/bilibili\.com\/video\/(BV\w+)/i) || url.match(/b23\.tv\/(\w+)/i);
  if (bv) {
    return { kind: "iframe", src: `https://player.bilibili.com/player.html?bvid=${bv[1]}&high_quality=1` };
  }
  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  }
  // 本站上传
  if (url.startsWith("/uploads/")) {
    return { kind: "video", src: url };
  }
  return { kind: "link", text: url };
}

export function CommunityMediaGrid({ items }: { items: MediaItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((item, i) => {
        if (item.type === "image") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={item.url} target="_blank" rel="noopener noreferrer">
              <img
                src={item.url}
                alt={`附件 ${i + 1}`}
                className="h-32 w-full rounded-lg object-cover transition hover:opacity-80"
              />
            </a>
          );
        }
        // video
        const embed = videoEmbed(item.url);
        if (embed.kind === "iframe" && embed.src) {
          return (
            <div key={i} className="relative h-32 overflow-hidden rounded-lg bg-black">
              <iframe
                src={embed.src}
                className="h-full w-full"
                title={`视频 ${i + 1}`}
                scrolling="no"
                frameBorder="0"
                allowFullScreen
              />
            </div>
          );
        }
        if (embed.kind === "video" && embed.src) {
          return (
            <video
              key={i}
              src={embed.src}
              controls
              className="h-32 w-full rounded-lg bg-black object-contain"
            />
          );
        }
        return (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-32 items-center justify-center rounded-lg bg-gray-100 text-xs text-brand-500"
          >
            🎬 {embed.text?.slice(0, 30) || "视频链接"}
          </a>
        );
      })}
    </div>
  );
}
