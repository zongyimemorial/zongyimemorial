/**
 * 身份快照公共函数 —— 纪念馆追思记录、宗祠祭祀记录、社区帖子/回帖共用。
 *
 * 冻结用户写入时的脱敏身份（`displayName`）与完整实名（`realNameSnap`/`contactSnap`），
 * 用户日后改实名**不会**回溯改写历史记录（防身份漂移，是有意设计，勿"修复"）。
 *
 * 口径见 AGENTS.md「宗祠祭祀记录 + 纪念馆追思记录的身份展示」。
 */
import { prisma } from "@/lib/db";
import { maskIdentity } from "@/lib/mask";

export async function identitySnapshot(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { realName: true, phone: true, email: true },
  });
  const ident = maskIdentity(dbUser);
  return {
    displayName: ident.display,
    realNameSnap: ident.realName,
    contactSnap: ident.contact,
  };
}

export type IdentitySnapshot = Awaited<ReturnType<typeof identitySnapshot>>;
