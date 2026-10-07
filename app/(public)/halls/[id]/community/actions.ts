"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { identitySnapshot } from "@/lib/identity";
import {
  isCommunityMember,
  joinByCode,
  ensureOwnerMember,
  MAX_MEDIA_PER_POST,
  type CommunityScope,
} from "@/lib/community";

export type CommunityResult = { ok: boolean; message?: string };

/** 发帖（文本 + mediaUrls JSON 字符串） */
export async function createPost(formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const hallId = String(formData.get("hallId") || "");
  const clanHallId = String(formData.get("clanHallId") || "");
  const scope: CommunityScope = hallId ? { hallId } : clanHallId ? { clanHallId } : {};
  const content = String(formData.get("content") || "").trim().slice(0, 2000);
  const mediaRaw = String(formData.get("mediaUrls") || "[]");

  if (!content && mediaRaw === "[]") return { ok: false, message: "请输入文字或添加图片/视频" };

  let mediaUrls: { type: "image" | "video"; url: string }[] = [];
  try {
    mediaUrls = JSON.parse(mediaRaw);
    if (!Array.isArray(mediaUrls)) throw new Error();
    if (mediaUrls.length > MAX_MEDIA_PER_POST) return { ok: false, message: `最多 ${MAX_MEDIA_PER_POST} 个附件` };
  } catch {
    return { ok: false, message: "附件数据格式有误" };
  }

  // 成员校验
  const ok = await isCommunityMember(user.id, scope);
  if (!ok) return { ok: false, message: "你不是该社区成员，无法发帖" };

  const snap = await identitySnapshot(user.id);

  await prisma.communityPost.create({
    data: {
      ...scope,
      authorId: user.id,
      content,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      ...snap,
    },
  });

  // revalidate 两条路径（纪念馆 / 宗祠）
  if (hallId) {
    revalidatePath(`/halls/${hallId}/community`);
    revalidatePath(`/halls/${hallId}`);
  }
  if (clanHallId) {
    revalidatePath(`/clan/halls/${clanHallId}/community`);
    revalidatePath(`/clan/halls/${clanHallId}`);
  }

  return { ok: true, message: "发布成功" };
}

/** 回帖 */
export async function createReply(formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const postId = String(formData.get("postId") || "");
  const content = String(formData.get("content") || "").trim().slice(0, 1000);

  if (!postId) return { ok: false, message: "缺少帖子 id" };
  if (!content) return { ok: false, message: "请输入回复内容" };

  // 查帖子 → 推导 scope → 成员校验
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hallId: true, clanHallId: true },
  });
  if (!post) return { ok: false, message: "帖子不存在" };

  const scope: CommunityScope = post.hallId
    ? { hallId: post.hallId }
    : post.clanHallId
      ? { clanHallId: post.clanHallId }
      : {};

  const ok = await isCommunityMember(user.id, scope);
  if (!ok) return { ok: false, message: "你不是该社区成员，无法回复" };

  const snap = await identitySnapshot(user.id);

  await prisma.communityReply.create({
    data: {
      postId,
      authorId: user.id,
      content,
      ...snap,
    },
  });

  if (post.hallId) revalidatePath(`/halls/${post.hallId}/community`);
  if (post.clanHallId) revalidatePath(`/clan/halls/${post.clanHallId}/community`);

  return { ok: true, message: "回复成功" };
}

/** 凭邀请码加入社区 */
export async function joinCommunity(formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const code = String(formData.get("code") || "").trim();
  if (!code) return { ok: false, message: "请输入邀请码" };

  const result = await joinByCode(user.id, code);
  if (result.ok && result.scope) {
    if (result.scope.hallId) revalidatePath(`/halls/${result.scope.hallId}/community`);
    if (result.scope.clanHallId) revalidatePath(`/clan/halls/${result.scope.clanHallId}/community`);
  }
  return result;
}

/** 馆主首次打开社区时确保自己是 owner 成员 */
export async function ensureOwner(formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const hallId = String(formData.get("hallId") || "");
  const clanHallId = String(formData.get("clanHallId") || "");
  const scope: CommunityScope = hallId ? { hallId } : clanHallId ? { clanHallId } : {};

  await ensureOwnerMember(user.id, scope);
  if (hallId) revalidatePath(`/halls/${hallId}/community`);
  if (clanHallId) revalidatePath(`/clan/halls/${clanHallId}/community`);

  return { ok: true };
}
