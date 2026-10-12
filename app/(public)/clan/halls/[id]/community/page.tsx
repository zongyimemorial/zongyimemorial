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
import {
  regenerateClanInviteCode,
  removeClanCommunityMember,
} from "@/app/console/clan-halls/[id]/actions";

export const dynamic = "force-dynamic";

export default async function ClanCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { id: clanHallId } = await params;
  const { code } = await searchParams;

  const clan = await prisma.clanHall.findUnique({
    where: { id: clanHallId },
    select: {
      id: true,
      hallName: true,
      surname: true,
      status: true,
      ownerUserId: true,
      communityInviteCode: true,
    },
  });
  if (!clan) notFound();
  if (clan.status !== "active") notFound();

  const user = await getCurrentUser();
  const isOwner = !!user?.id && clan.ownerUserId === user.id;

  // 馆主自动是社区成员
  if (isOwner && user?.id) {
    await ensureOwnerMember(user.id, { clanHallId });
  }

  const isMember = user?.id ? await isCommunityMember(user.id, { clanHallId }) : false;

  // 非成员 + URL 带了 code → 尝试自动加入
  if (user?.id && !isMember && code) {
    const { joinByCode } = await import("@/lib/community");
    await joinByCode(user.id, code!);
  }

  const isMemberNow = user?.id
    ? isOwner || (await isCommunityMember(user.id, { clanHallId }))
    : false;

  const count = await memberCount({ clanHallId });
  const inviteCode = isOwner ? clan.communityInviteCode ?? (await getOrCreateInviteCode({ clanHallId })) : null;

  // 查帖子（只 select displayName，不泄露实名）
  const posts = isMemberNow
    ? await prisma.communityPost.findMany({
        where: { clanHallId },
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
        <Link href={`/clan/halls/${clanHallId}`} className="hover:text-brand-600">
          ← 返回{clan.hallName}
        </Link>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">亲友交流社区</h1>
          <p className="mt-1 text-sm text-gray-500">
            {clan.hallName} · {clan.surname}氏 · {count} 位成员
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
              clanHallId={clanHallId}
              regenerate={regenerateClanInviteCode}
            />
          )}

          {/* 发帖 */}
          <CommunityComposer clanHallId={clanHallId} createPost={createPost} />

          {/* 帖子流 */}
          {typedPosts.length === 0 ? (
            <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-8 text-center text-sm text-gray-400">
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
