/**
 * 装修商品 ↔ 装修素材 的映射与发货逻辑
 *
 * 用户口径（2026-10）：
 *   「设计成商城里的独立商品」「付费是指可以积分兑换也可以用货币支付」
 *
 * 设计要点：
 *   1. 商品 slug 与装修素材 id **不共用命名空间** —— 商品 slug 走 `decor-` 前缀，
 *      OrderItem 里存的是 productId，靠本文件反查该发什么权益。
 *      这样以后重命名素材 id（虽然不该做）不会连带把历史订单的语义弄丢。
 *   2. 发货 = 往各馆装修方案的 `unlocked` 里写 `buy:<素材id>` / `tpl:<模板id>`。
 *      写**馆**而不是写**用户**：装修是馆的属性，同一用户名下多个馆应各自持有权益？
 *      —— 不，这里刻意写成**用户级 spread 到其名下所有馆**，理由见 issueDecorEntitlement。
 *   3. 积分兑换（violet 按钮）走 `unlockDecor` action，与货币购买**落到同一个键**，
 *      所以两条路买到的素材在界面上完全等价，不会出现"用积分换的锁还在"。
 */
import { prisma } from "@/lib/db";
import {
  BUNDLES,
  buyKey,
  findBundle,
  findDecorItem,
  findTemplate,
  isKeyActive,
  nextExpiry,
  normalizeEntitlements,
  tplKey,
  KITS,
  type DecorLeaseMap,
  type DecorKit,
} from "@/lib/hall-decor";
// CLAN_KITS 定义在 clan-decor.ts（值不能跨库定义，见该处注释）
import { CLAN_KITS, findClanDecorItem, findClanTemplate } from "@/lib/clan-decor";

/** 装修商品的 slug 前缀。商城里的装修商品一律以它开头。 */
export const DECOR_SLUG_PREFIX = "decor-";

/** 一件装修商品要发放的权益 */
export type DecorEntitlement = {
  kind: "kit" | "template" | "item" | "bundle";
  /** 目标：hall（纪念馆）| clan（宗祠） */
  target: "hall" | "clan";
  /** 素材 / 模板 id */
  id: string;
  /** 写进 unlocked 的键 */
  key: string;
  /** 套件包含的全部素材 id（kind=kit 时有值） */
  includes?: string[];
  /**
   * 礼包包含的全部**商品解锁键**（kind=bundle 时有值），
   * 形如 `["tpl:tpl-tangzhi", "kit:kit-imperial-hall"]`。
   *
   * ⚠️ 这里存的是**已经算好的键**，不是 id —— 因为礼包里的项
   *    既可能是模板也可能是套件，发货时不该再做一次"查表判类型"。
   *    算键的唯一入口是 `bundleEntitlementKeys()`。
   */
  grants?: string[];
};

/**
 * 把商品 slug 解析成权益。
 *
 * 支持四种粒度：
 *   - `decor-bundle-*` 典藏礼包（一次解锁多套模板 / 套件）
 *   - `decor-kit-*`    套件（一次解锁多件素材）
 *   - `decor-tpl-*`    模板
 *   - `decor-item-*`   单件素材
 * 以及宗祠侧（`decor-clan-*`），靠 `target` 区分。
 *
 * 返回 null 表示 slug 不是装修商品（调用方应跳过，而不是报错 ——
 * 发货链路上会遍历所有 orderItems，非装修商品是常态）。
 */
export function resolveDecorEntitlement(slug: string): DecorEntitlement | null {
  if (!slug.startsWith(DECOR_SLUG_PREFIX)) return null;

  // 宗祠商品：decor-clan-...
  const isClan = slug.startsWith("decor-clan-");
  const target: "hall" | "clan" = isClan ? "clan" : "hall";
  const body = slug.slice(DECOR_SLUG_PREFIX.length); // clan-xxx / kit-xxx / tpl-xxx / bundle-xxx

  /*
    礼包：decor-bundle-xxx（**目前只有纪念馆侧有礼包**）。
    ⚠️ 必须排在套件/模板之前判定：礼包 id 是 `decor-bundle-imperial`，
       若不先拦，后面套件的模糊匹配 `slug.includes(k.id)` 理论上可能误命中
       （虽然当前 kit id 都不含 bundle 字样，但顺序对了才不依赖"恰好不撞"）。
  */
  const bundleId = body.replace(/^clan-/, "");
  const bundle =
    findBundle(bundleId) ??
    findBundle(`decor-${bundleId}`) ??
    BUNDLES.find((b) => slug.includes(b.id));
  if (bundle) {
    /*
      礼包发货 = 逐件展开成包内每一项的**商品键**。
      只写一个 `bundle:<id>` 是不够的：渲染层是按 `tpl:` / `kit:` / `buy:` 判解锁的，
      只记 bundle 键会让用户看到"礼包买了，里面的模板全都还锁着"
      —— 这正是套件早期踩过的坑（"扣了积分、写了兑换记录，但什么都没到手"），
      礼包更严重（它包的是整套模板）。
    */
    const grants = bundle.includes.flatMap((id) => {
      const tpl = findTemplate(id) ?? findClanTemplate(id);
      return tpl ? [tplKey(id)] : [`kit:${id}`];
    });
    // 套件本身也要把它的 includes 展开（礼包里含套件时）
    const kitParts = bundle.includes.flatMap((id) => {
      const kit = KITS.find((k) => k.id === id) ?? CLAN_KITS.find((k) => k.id === id);
      return kit ? kit.includes.map((p) => buyKey(p)) : [];
    });
    return {
      kind: "bundle",
      target,
      id: bundle.id,
      key: `bundle:${bundle.id}`,
      grants: [...grants, ...kitParts],
    };
  }

  // 套件：decor-kit-xxx / decor-clan-kit-xxx
  const kitId = body.replace(/^clan-/, "");
  const kit: DecorKit | undefined = (isClan ? CLAN_KITS : KITS).find(
    (k) => k.id === kitId || `kit-${k.id}` === kitId || slug.includes(k.id),
  );
  if (kit) {
    return {
      kind: "kit",
      target,
      id: kit.id,
      key: `kit:${kit.id}`,
      includes: kit.includes,
    };
  }

  // 模板
  const tpl = isClan
    ? findClanTemplate(body.replace(/^tpl-/, "")) ?? findClanTemplate(body) ?? findClanTemplate(slug)
    : findTemplate(body.replace(/^tpl-/, "")) ?? findTemplate(body) ?? findTemplate(slug.replace(/^decor-/, ""));
  if (tpl) {
    // 只有收费模板才需要发权益；赠品/免费模板不该在商城出现
    return { kind: "template", target, id: tpl.id, key: tplKey(tpl.id) };
  }

  // 单件素材
  const itemId = body.replace(/^item-/, "");
  const item = isClan ? findClanDecorItem(itemId) : findDecorItem(itemId);
  if (item) return { kind: "item", target, id: item.id, key: buyKey(item.id) };

  return null;
}

/**
 * 发货：把权益写进该用户**名下所有**对应类型的馆。
 *
 * 为什么写"所有馆"而不是"某一个馆"：
 *   装修素材的定价是按"件"标的（¥1–4 一件），用户买的是**使用权**。
 *   若限定单馆，用户新建第二个馆时要为同一块壁纸再付一次钱 ——
 *   这在数字商品语境里近乎欺骗。写进所有馆，语义是"这个账号拥有它"。
 *
 *   ⚠️ 与「建馆赠品」的区别：赠品只发给**新建的那一个馆**（用户明确要求
 *      "只在建新馆时免费赠送一套"），因此赠品走 decor.granted、不走 unlocked。
 *
 * @returns 实际写到几个馆
 */
export async function issueDecorEntitlement(
  userId: string,
  ent: DecorEntitlement,
  db?: { memorialHall: { findMany: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> }; clanHall: { findMany: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> } },
): Promise<number> {
  const c = (db ?? prisma) as unknown as NonNullable<typeof db>;
  const isClan = ent.target === "clan";

  const rows = (await (isClan
    ? c.clanHall.findMany({ where: { ownerUserId: userId }, select: { id: true, templateConfig: true } })
    : c.memorialHall.findMany({ where: { ownerUserId: userId }, select: { id: true, templateConfig: true } }))) as {
    id: string;
    templateConfig: unknown;
  }[];

  let n = 0;
  for (const row of rows) {
    const cfg = (row.templateConfig as Record<string, unknown> | null) ?? {};
    const decor = ((cfg.decor ?? {}) as Record<string, unknown>) ?? {};
    const unlocked = Array.isArray(decor.unlocked) ? (decor.unlocked as unknown[]).map(String) : [];
    const entitlements: DecorLeaseMap =
      normalizeEntitlements(decor.entitlements) ?? {};

    /*
      本单要写入的全部键（含套件/礼包展开的键），先收集、后统一判定。
      键的三种情形：
        a) 不在 unlocked            → 新发（unlocked + entitlements 都写，365 天）
        b) 在 unlocked 且租期永久    → skip（重复购买已永久持有的东西，什么都不动；
                                       尤其**不许**把永久降级成 365 天）
        c) 在 unlocked 但租期已过    → 续费（unlocked 已有键，只把 entitlements
                                       顺延到 now+365 —— 这就是"续费恢复"路径）
      三种情形都必须**整单一致**：只要有一个键属于 a/c，本馆就要落库。
    */
    const keysToWrite: string[] = [];
    const addIfNewOrExpired = (k: string) => {
      if (!unlocked.includes(k)) {
        keysToWrite.push(k);
        return;
      }
      if (!isKeyActive(k, entitlements)) {
        keysToWrite.push(k); // 已过期：续费
      }
      // 永久持有的键 → 不动（不降级、不重复计期）
    };

    addIfNewOrExpired(ent.key);

    /*
      套件：把 includes 里的每件素材也一并解锁。
      只记一个 `kit:` 键是不够的 —— 渲染层是按素材 id 判解锁的，
      不解锁 includes，用户会看到"套件已购买，但里面的挂饰仍然锁着"。
    */
    if (ent.kind === "kit" && ent.includes) {
      for (const iid of ent.includes) addIfNewOrExpired(buyKey(iid));
    }

    /*
      礼包：把 grants（包内每一项已算好的 `tpl:` / `kit:` / `buy:` 键）全部写入。
      再补一个 `kit:` 键 —— 礼包里若含套件，用户点"应用整套"时
      渲染层会去查 `kit:<id>` 是否存在；只写 `buy:` 零件会让整装包的
      「一键应用（含墙地）」入口查不到套件本体。
    */
    if (ent.kind === "bundle") {
      for (const k of ent.grants ?? []) addIfNewOrExpired(k);
      for (const id of findBundle(ent.id)?.includes ?? []) addIfNewOrExpired(`kit:${id}`);
    }

    // 本馆没有任何要写的键（全部键已永久持有）→ 整单跳过
    if (keysToWrite.length === 0) continue;

    const nextUnlocked = [...unlocked];
    const nextEntitlements: DecorLeaseMap = { ...entitlements };
    for (const k of new Set(keysToWrite)) {
      if (!nextUnlocked.includes(k)) nextUnlocked.push(k);
      /*
        新购/续费一律 365 天（ENTITLEMENT_DAYS）。
        续期基准 nextExpiry：现有租期未过则顺延叠加、已过则从今天起算 ——
        与 premium 订阅续期同构。**永久条目（null）永远不会走到这里**：
        上面的 addIfNewOrExpired 已把永久键排除在 keysToWrite 之外。
      */
      nextEntitlements[k] = nextExpiry(nextEntitlements[k] ?? entitlements[k]);
    }

    const nextDecor = { ...decor, unlocked: nextUnlocked, entitlements: nextEntitlements };
    const data = { templateConfig: { ...cfg, decor: nextDecor } };

    if (isClan) await c.clanHall.update({ where: { id: row.id }, data });
    else await c.memorialHall.update({ where: { id: row.id }, data });
    n++;
  }
  return n;
}
