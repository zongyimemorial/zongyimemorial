import { CommunityMediaGrid } from "./CommunityMediaGrid";
import CommunityReplyForm from "./CommunityReplyForm";
import type { MediaItem } from "./CommunityMediaGrid";

export type Reply = {
  id: string;
  content: string;
  displayName: string;
  createdAt: Date;
};

export type Post = {
  id: string;
  content: string;
  mediaUrls: MediaItem[] | null;
  displayName: string;
  createdAt: Date;
  replies: Reply[];
};

/**
 * 社区帖子卡片（服务端组件）。
 *
 * 渲染：作者脱敏名号 + 时间 + 正文 + 附件网格 + 回复列表 + 回复表单。
 * 只读 `displayName`（脱敏快照），绝不读 realNameSnap / contactSnap。
 */
export function CommunityPostCard({
  post,
  createReply,
}: {
  post: Post;
  createReply: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const time = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(post.createdAt));

  return (
    <article className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-brand-700">{post.displayName}</span>
        <span>·</span>
        <span>{time}</span>
      </div>

      {post.content && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{post.content}</p>
      )}

      <CommunityMediaGrid items={post.mediaUrls ?? []} />

      {post.replies && post.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-brand-200 pl-3">
          {post.replies.map((r) => {
            const rTime = new Intl.DateTimeFormat("zh-CN", {
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            }).format(new Date(r.createdAt));
            return (
              <div key={r.id} className="text-xs">
                <span className="font-medium text-brand-600">{r.displayName}</span>
                <span className="text-gray-400"> · {rTime}</span>
                <p className="mt-0.5 text-gray-700">{r.content}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2">
        <CommunityReplyForm postId={post.id} createReply={createReply} />
      </div>
    </article>
  );
}
