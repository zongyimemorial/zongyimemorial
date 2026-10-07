"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { earnPoints } from "@/lib/points";

// ===== 族谱上传（数字化存储，先审后显）=====
export async function uploadGenealogy(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { idVerified: true } });
  if (!dbUser?.idVerified) return { ok: false, message: "上传族谱需先完成实名认证" };

  const surname = String(formData.get("surname") || "").trim();
  const hallName = String(formData.get("hallName") || "").trim();
  const origin = String(formData.get("origin") || "").trim();
  const lineage = String(formData.get("lineage") || "").trim();
  const migration = String(formData.get("migration") || "").trim();
  const membersText = String(formData.get("members") || "").trim();
  const fileUrl = String(formData.get("fileUrl") || "").trim();

  if (!surname) return { ok: false, message: "请填写姓氏" };
  if (membersText.length > 20000) return { ok: false, message: "世系成员内容过长" };

  // 数字化世系：每行一条 "世代|姓名|关系|备注"，容错解析
  const members = membersText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [gen, name, relation, note] = l.split(/[|｜,，]/).map((s) => s?.trim());
      return { gen: gen ?? "", name: name ?? "", relation: relation ?? "", note: note ?? "" };
    });

  await prisma.genealogy.create({
    data: {
      ownerId: user.id!,
      surname,
      hallName: hallName || null,
      origin: origin || null,
      lineage: lineage || null,
      migration: migration || null,
      membersJson: members.length ? members : undefined,
      fileUrl: fileUrl || null,
      status: "pending",
    },
  });

  await earnPoints({ userId: user.id!, amount: 50, reason: "上传族谱资料" });
  revalidatePath("/clan/genealogy");
  return { ok: true, message: "族谱已提交，审核通过后将公开可检索（+50积分）" };
}

// ===== 寻根谒祖：按姓氏+祖籍智能匹配族谱 =====
export async function searchRoots(surname: string, origin: string) {
  const s = surname.trim();
  const o = origin.trim();
  if (!s) return [];

  const rows = await prisma.genealogy.findMany({
    where: {
      status: "approved",
      isPublic: true,
      surname: s,
      ...(o ? { OR: [{ origin: { contains: o } }, { migration: { contains: o } }] } : {}),
    },
    orderBy: { viewCount: "desc" },
    take: 20,
    select: {
      id: true, surname: true, hallName: true, origin: true,
      lineage: true, migration: true, viewCount: true,
    },
  });

  // 宽松补充：同姓氏但祖籍不完全匹配的族谱，供溯源参考
  if (rows.length < 5) {
    const extra = await prisma.genealogy.findMany({
      where: { status: "approved", isPublic: true, surname: s, id: { notIn: rows.map((r) => r.id) } },
      take: 10,
      select: {
        id: true, surname: true, hallName: true, origin: true,
        lineage: true, migration: true, viewCount: true,
      },
    });
    rows.push(...extra);
  }
  return rows;
}

// ===== 宗亲社区发帖（先审后显）=====
export async function createClanPost(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { idVerified: true } });
  if (!dbUser?.idVerified) return { ok: false, message: "发帖需先完成实名认证，营造可信宗亲社区" };

  const surname = String(formData.get("surname") || "").trim();
  const topic = String(formData.get("topic") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!surname || !title || !body) return { ok: false, message: "请完整填写姓氏、标题与内容" };
  if (title.length > 60) return { ok: false, message: "标题不超过60字" };

  await prisma.clanPost.create({
    data: { userId: user.id!, surname, topic: topic || "联谊交流", title, body, status: "pending" },
  });
  await earnPoints({ userId: user.id!, amount: 5, reason: "宗亲社区发帖" });
  revalidatePath("/clan/community");
  return { ok: true, message: "帖子已提交审核，通过后公开显示（+5积分）" };
}

// ===== 宗亲社区回帖（先审后显）=====
export async function replyClanPost(postId: string, body: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  const text = body.trim();
  if (!text) return { ok: false, message: "请输入回帖内容" };

  await prisma.clanPostReply.create({ data: { postId, userId: user.id!, body: text, status: "pending" } });
  revalidatePath("/clan/community");
  return { ok: true, message: "回帖已提交审核" };
}

// ===== 宗族活动报名 =====
export async function signupActivity(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };

  const activityId = String(formData.get("activityId") || "");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const note = String(formData.get("note") || "").trim();
  if (!activityId || !name || !phone) return { ok: false, message: "请填写姓名与联系电话" };

  const activity = await prisma.clanActivity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, message: "活动不存在" };
  if (activity.status === "finished") return { ok: false, message: "活动已结束" };
  if (activity.signupCount >= activity.capacity) return { ok: false, message: "报名名额已满" };

  try {
    await prisma.clanActivitySignup.create({
      data: { activityId, userId: user.id!, name, phone, note: note || null },
    });
    await prisma.clanActivity.update({
      where: { id: activityId },
      data: { signupCount: { increment: 1 } },
    });
  } catch {
    return { ok: false, message: "您已报名过该活动" };
  }
  revalidatePath("/clan/activities");
  return { ok: true, message: `报名成功！活动地点：${activity.location}` };
}
