/**
 * 建馆赠品：新建纪念馆 / 宗祠时自动发放一套模板（永久免费）。
 *
 * 用户口径（2026-10）：「只在建新馆时免费赠送一套，其他的均改为付费」。
 *
 * 为什么单独一个模块、而不写进各自的 actions：
 *   赠品有**两个写入时点**（建馆时自动发、存量馆一次性补发），两条路径必须
 *   口径完全一致 —— 否则新馆拿到的和补发到的不是一回事。集中在这里，
 *   由 HALL_GRANT_TEMPLATE / CLAN_GRANT_TEMPLATE 各定义一个唯一来源。
 *
 * ⚠️ 赠品写进 `decor.granted`，**不写进 `decor.unlocked`**。
 *    两者语义不同：
 *      · unlocked = "我买过 / 兑过什么" —— 会被后台档位调整、用户「恢复默认」反复重写
 *      · granted  = "平台承诺送我的" —— 一次性写入，之后谁都不许动它
 *    合并成一个字段后，用户点一次「恢复默认」就会把赠品吃掉，
 *    表现为"说好送的一套装修凭空消失"。历史上宗祠烟花就因为取数窗口写窄而静默丢过功能，
 *    这类静默丢权益必须靠**独立存储**来根治，而不是靠"记得别覆盖"。
 */
import { prisma } from "@/lib/db";
import {
  HALL_GRANT_TEMPLATE,
  findTemplate,
  normalizeDecor,
  normalizeEntitlements,
  type HallDecor,
} from "@/lib/hall-decor";
import {
  CLAN_GRANT_TEMPLATE,
  findClanTemplate,
  normalizeClanDecor,
} from "@/lib/clan-decor";
import { isPremiumUntil } from "@/lib/premium";

type Kind = "hall" | "clan";

/**
 * 最小 Prisma 客户端接口。
 *
 * 支付发货链路跑在 `prisma.$transaction(tx => …)` 里，此时必须用 tx 而不是全局
 * prisma —— 用全局的话，赠品写入会落在事务**之外**，主事务一回滚，
 * 就会出现"馆没建成、赠品却发出去了"的脏数据。
 * 这里只声明用到的两个 model，避免依赖 PrismaClient 的完整类型。
 */
type Db = {
  memorialHall: { findUnique: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> };
  clanHall: { findUnique: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> };
};

/** 取某类馆的赠品模板 id */
export function grantTemplateId(kind: Kind) {
  return kind === "hall" ? HALL_GRANT_TEMPLATE : CLAN_GRANT_TEMPLATE;
}

/** 取某类馆的赠品模板对象 */
export function grantTemplate(kind: Kind) {
  return kind === "hall"
    ? findTemplate(HALL_GRANT_TEMPLATE)
    : findClanTemplate(CLAN_GRANT_TEMPLATE);
}

/**
 * 读出一份装修方案里已发放的赠品 id 列表。
 * 传给 normalize* 的 `granted`，让赠品零件被判为已解锁。
 */
export function grantedOf(cfg: unknown): string[] {
  const raw = ((cfg as { decor?: unknown } | null)?.decor ?? {}) as Partial<HallDecor>;
  return Array.isArray(raw.granted) ? raw.granted.map(String) : [];
}

/**
 * 把赠品写进该馆的装修方案（幂等：已发放过就原样返回）。
 *
 * @param kind  "hall" | "clan"
 * @param id    馆 id
 * @param db    可选的 Prisma 客户端。在事务里调用时必须传 `tx`，
 *              否则赠品写入会落在事务外（主事务回滚后变成脏数据）。
 * @returns     本次是否真的写入（false = 之前已发放过）
 */
export async function issueGrant(kind: Kind, id: string, db?: Db): Promise<boolean> {
  const c = (db ?? prisma) as unknown as Db;
  const row = (await (kind === "hall"
    ? c.memorialHall.findUnique({
        where: { id },
        select: { id: true, templateConfig: true, premiumUntil: true },
      })
    : c.clanHall.findUnique({
        where: { id },
        select: { id: true, templateConfig: true, premiumUntil: true },
      }))) as
    | { id: string; templateConfig: unknown; premiumUntil: Date | null }
    | null;
  if (!row) return false;

  const cfg = (row.templateConfig as Record<string, unknown> | null) ?? {};
  const existing = grantedOf(cfg);
  const tplId = grantTemplateId(kind);
  if (existing.includes(tplId)) return false; // 已发放，幂等返回

  const tpl = grantTemplate(kind);
  if (!tpl) return false;

  /*
    这里只拿到 row（无 user 上下文），故用 `isPremiumUntil` 这个单来源原语。
    影响面有限：赠品模板本次就写进 `granted`，归一化时 `granted.includes(tpl.id)`
    已能放行 —— 所以这个值不影响结果，仅保持"判定只有一个实现"的一致性。
  */
  const isPremium = isPremiumUntil(row.premiumUntil);
  const unlocked = Array.isArray((cfg.decor as HallDecor | undefined)?.unlocked)
    ? (((cfg.decor as HallDecor).unlocked ?? []) as unknown[]).map(String)
    : [];

  /*
    赠品模板的槽位直接落进装修方案 —— 用户建完馆打开就是一套完整装修，
    而不是"有一张券但还得自己配零件"。

    ⚠️ `entitlements` 必须从库里原样带上（2026-10 租期制）：
    normalizeDecor 的返回值是"整个写回库"的，而它的租期表**从 input 透传**
    —— 这里 input 是手造对象（不是 `{...rawDecor}` 展开），不带就等于
    把用户已购素材的租期表整个抹掉。backfillGrants 对全库存量馆补发时，
    这一下会扫掉所有馆的租期记录（"静默丢权益"的又一种形态）。
  */
  const nextDecor = {
    templateId: tpl.id,
    slots: { ...tpl.slots },
    unlocked,
    granted: [...existing, tpl.id],
    entitlements: normalizeEntitlements(
      ((cfg.decor as Partial<HallDecor> | undefined)?.entitlements) ?? undefined,
    ),
    updatedAt: new Date().toISOString(),
  };

  // 用各自的归一化函数兜一遍，确保写进去的就是页面读得出来的
  const normalized =
    kind === "hall"
      ? normalizeDecor(nextDecor, {
          isPremium,
          unlocked,
          granted: nextDecor.granted,
          entitlements: nextDecor.entitlements,
        })
      : normalizeClanDecor(nextDecor, {
          isPremium,
          unlocked,
          granted: nextDecor.granted,
          entitlements: nextDecor.entitlements,
        });

  if (kind === "hall") {
    await c.memorialHall.update({
      where: { id },
      data: { templateConfig: { ...cfg, decor: normalized } },
    });
  } else {
    await c.clanHall.update({
      where: { id },
      data: { templateConfig: { ...cfg, decor: normalized } },
    });
  }
  return true;
}

/**
 * 存量馆补发：给建馆早于本机制的馆补上赠品。
 *
 * 不补发的后果：老用户进装修工坊会发现**连原来能用的免费模板都被锁了**，
 * 体感是"平台把我的权益收回了"。这是改文案解决不了的，必须补数据。
 *
 * 幂等：靠 issueGrant 内部的「已发放过就跳过」保证，可反复执行。
 */
export async function backfillGrants(): Promise<{ halls: number; clans: number }> {
  const halls = await prisma.memorialHall.findMany({ select: { id: true } });
  const clans = await prisma.clanHall.findMany({ select: { id: true } });

  let h = 0;
  for (const r of halls) if (await issueGrant("hall", r.id)) h++;
  let c = 0;
  for (const r of clans) if (await issueGrant("clan", r.id)) c++;

  return { halls: h, clans: c };
}
