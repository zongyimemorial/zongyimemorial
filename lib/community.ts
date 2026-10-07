/**
 * 社区公共函数：成员判定、邀请码、加入。
 *
 * 多态外键（hallId / clanHallId 二选一）与 OfferingOnAltar 同口径。
 * 所有函数都接受 { hallId?: string; clanHallId?: string } 形式的 scope 对象。
 */
import { prisma } from "@/lib/db";
import { identitySnapshot } from "@/lib/identity";
import { randomBytes } from "node:crypto";

/** 每帖最多附件数（图+视频合计） */
export const MAX_MEDIA_PER_POST = 9;
/** 视频上传上限（50MB）——隧道下可能传不完，引导优先用 URL 嵌入 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type CommunityScope = { hallId?: string; clanHallId?: string };

/** 确保恰好一个外键非空 */
function validateScope(scope: CommunityScope): asserts scope is { hallId?: string; clanHallId?: string } {
  const has = !!scope.hallId || !!scope.clanHallId;
  if (!has) throw new Error("社区范围无效：hallId 和 clanHallId 都为空");
  if (scope.hallId && scope.clanHallId) throw new Error("社区范围无效：hallId 和 clanHallId 不能同时有");
}

/** 判定某用户是否是某馆/祠的社区成员 */
export async function isCommunityMember(userId: string, scope: CommunityScope): Promise<boolean> {
  validateScope(scope);
  const where = scope.hallId
    ? { hallId_userId: { hallId: scope.hallId, userId } }
    : { clanHallId_userId: { clanHallId: scope.clanHallId!, userId } };
  const m = await prisma.communityMember.findUnique({ where });
  return !!m;
}

/** 获取馆主邀请码（没有则生成） */
export async function getOrCreateInviteCode(scope: CommunityScope): Promise<string> {
  validateScope(scope);
  if (scope.hallId) {
    const hall = await prisma.memorialHall.findUnique({
      where: { id: scope.hallId },
      select: { communityInviteCode: true },
    });
    if (hall?.communityInviteCode) return hall.communityInviteCode;
    const code = randomBytes(8).toString("hex");
    await prisma.memorialHall.update({ where: { id: scope.hallId }, data: { communityInviteCode: code } });
    return code;
  } else {
    const clan = await prisma.clanHall.findUnique({
      where: { id: scope.clanHallId! },
      select: { communityInviteCode: true },
    });
    if (clan?.communityInviteCode) return clan.communityInviteCode;
    const code = randomBytes(8).toString("hex");
    await prisma.clanHall.update({ where: { id: scope.clanHallId! }, data: { communityInviteCode: code } });
    return code;
  }
}

/** 凭邀请码加入社区。返回 { ok, message } */
export async function joinByCode(
  userId: string,
  code: string,
): Promise<{ ok: boolean; message: string; scope?: CommunityScope }> {
  // 在两张表里找邀请码
  const hall = await prisma.memorialHall.findUnique({
    where: { communityInviteCode: code },
    select: { id: true, status: true, ownerUserId: true },
  });
  const clan = hall
    ? null
    : await prisma.clanHall.findUnique({
        where: { communityInviteCode: code },
        select: { id: true, status: true, ownerUserId: true },
      });
  const target = hall
    ? { type: "hall" as const, id: hall.id, status: hall.status, ownerId: hall.ownerUserId }
    : clan
      ? { type: "clan" as const, id: clan.id, status: clan.status, ownerId: clan.ownerUserId }
      : null;
  if (!target) return { ok: false, message: "邀请码无效或已过期" };
  if (target.status !== "active") return { ok: false, message: "该馆/祠尚未通过审核" };

  const scope: CommunityScope = target.type === "hall" ? { hallId: target.id } : { clanHallId: target.id };
  const ownerId = target.ownerId;

  // 已是成员？
  if (await isCommunityMember(userId, scope)) return { ok: false, message: "你已是该社区成员", scope };

  // 写入成员记录（含身份快照）
  const snap = await identitySnapshot(userId);
  const isOwner = ownerId === userId;
  await prisma.communityMember.create({
    data: {
      ...scope,
      userId,
      role: isOwner ? "owner" : "member",
      ...snap,
      invitedById: ownerId,
    },
  });

  return { ok: true, message: "加入成功", scope };
}

/** 确保馆主自动是社区成员（首次打开社区时调用） */
export async function ensureOwnerMember(userId: string, scope: CommunityScope): Promise<void> {
  validateScope(scope);
  const existing = await isCommunityMember(userId, scope);
  if (existing) return;
  const snap = await identitySnapshot(userId);
  await prisma.communityMember.create({
    data: { ...scope, userId, role: "owner", ...snap },
  });
}

/** 成员数（公网入口卡展示用） */
export async function memberCount(scope: CommunityScope): Promise<number> {
  validateScope(scope);
  return prisma.communityMember.count({
    where: scope.hallId ? { hallId: scope.hallId } : { clanHallId: scope.clanHallId },
  });
}
