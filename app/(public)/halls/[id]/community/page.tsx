import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  isCommunityMember,
  getOrCreateInviteCode,
  ensureOwnerMember,
  memberCount,
} from "@/lib/community";

import CommunityComposer from "@/components/community/CommunityComposer";
import { CommunityPostCard, type Post } from "@/components/community/CommunityPostCard";
import CommunityInviteCard from "@/components/community/CommunityInviteCard";
import CommunityJoinCard from "@/components/community/CommunityJoinCard";
import { createPost, createReply, joinCommunity } from "./actions";
import { regenerateInviteCode, removeCommunityMember } from "@/app/console/halls/[id]/actions";

export const dynamic = "force-dynamic";

export default async function HallCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { id: hallId } = await params;
  const { code } = await searchParams;

  const hall = await prisma.memorialHall.findUnique({
    where: { id: hallId },
    select: {
      id: true,
      name: true,
      deceasedName: true,
      status: true,
      ownerUserId: true,
      communityInviteCode: true,
    },
  });
  if (!hall) notFound();
  if (hall.status !== "active") notFound();

  const user = await getCurrentUser();
  const isOwner = !!user?.id && hall.ownerUserId === user.id;

  // 馆主自动是社区成员
  if (isOwner && user?.id) {
    await ensureOwnerMember(user.id, { hallId });
  }

  const isMember = user?.id ? await isCommunityMember(user.id, { hallId }) : false;

  // 非成员 + URL 带了 code → 尝试自动加入
  if (user?.id && !isMember && code) {
    const { joinByCode } = await import("@/lib/community");
    const r = await joinByCode(user.id, code!);
    if (r.ok) {
      // 加入成功后刷新（让 isMember 变 true）
      // revalidatePath 已在 joinByCode 里调过
    }
  }

  // 重新检查成员状态（可能刚加入）
  const isMemberNow = user?.id
    ? isOwner || (await isCommunityMember(user.id, { hallId }))
    : false;

  const count = await memberCount({ hallId });
  const inviteCode = isOwner ? hall.communityInviteCode ?? (await getOrCreateInviteCode({ hallId })) : null;

  // 查帖子（只 select displayName，不泄露实名）
  const posts = isMemberNow
    ? await prisma.communityPost.findMany({
        where: { hallId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          displayName: true,
          createdAt: true,
          replies: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              content: true,
              displayName: true,
              createdAt: true,
            },
          },
        },
      })
    : [];

  const typedPosts = posts.map((p) => ({
    ...p,
    mediaUrls: p.mediaUrls as { type: "image" | "video"; url: string }[] | null,
  })) satisfies Post[];

  return (
    <div className="container-page max-w-3xl py-8">
      <nav className="mb-4 text-sm text-gray-400">
        <Link href={`/halls/${hallId}`} className="hover:text-brand-600">
          ← 返回{hall.name}
        </Link>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">亲友交流社区</h1>
          <p className="mt-1 text-sm text-gray-500">
            {hall.name} · {hall.deceasedName} · {count} 位亲友
          </p>
        </div>
      </div>

      {/* 非成员：显示加入入口 */}
      {!isMemberNow && <CommunityJoinCard presetCode={code} joinCommunity={joinCommunity} />}

      {/* 成员：显示社区 */}
      {isMemberNow && (
        <div className="space-y-4">
          {/* 馆主：邀请链接 */}
          {isOwner && inviteCode && (
            <CommunityInviteCard
              inviteCode={inviteCode}
              hallId={hallId}
              regenerate={regenerateInviteCode}
            />
          )}

          {/* 发帖 */}
          <CommunityComposer hallId={hallId} createPost={createPost} />

          {/* 帖子流 */}
          {typedPosts.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              社区还没有帖子，来发布第一条吧
            </div>
          ) : (
            typedPosts.map((p) => <CommunityPostCard key={p.id} post={p} createReply={createReply} />)
          )}
        </div>
      )}
    </div>
  );
}
