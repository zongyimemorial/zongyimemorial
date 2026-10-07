/**
 * 建馆审核流程核心库（多渠道替代核验 + 三通道分层 + 合规底线）
 * ------------------------------------------------------------------
 * 本文件是「可见性 / 通道 / 材料 / 补传期」的唯一事实来源，所有相关页面、动作、
 * 验收脚本都从这里取判据，**绝不在别处手写 `isPublic` 或 `status` 决定可见性**。
 *
 * 与 lib/storage.ts（容量单一判据）同构：把分散在多个文件里的「该不该公开 / 走哪条通道」
 * 收敛到一个地方，杜绝「同一事实多个判据」的口径分叉。
 *
 * 设计要点：
 *  - effectivePublic(hall)：公页可见性唯一判据（实时计算，无 cron）。
 *  - 60 天补传期靠 `supplementDeadline` + `supplementedAt` 实时判定，不依赖定时任务。
 *  - 实名门槛（idVerified）是建馆**前置硬条件**，本库不负责核查，但提供常量提示文案。
 */

export const SUPPLEMENT_DAYS = 60;

export const REVIEW_CHANNELS = ["standard", "alternative", "appeal"] as const;
export type ReviewChannel = (typeof REVIEW_CHANNELS)[number];

/** 材料类型注册表：每个类型归属某通道（宗祠基础材料算 standard 的特例） */
export const MATERIAL_TYPES = {
  // —— 第一梯队：法定证明类（标准通道）——
  fireProof: { label: "火化证明", channel: "standard" },
  death_cert: { label: "死亡医学证明", channel: "standard" },
  household_cancellation: { label: "户籍注销证明", channel: "standard" },
  court_death: { label: "法院宣告死亡判决书", channel: "standard" },
  // —— 第二梯队：殡葬机构辅助证明（替代通道）——
  ash_storage: { label: "骨灰存放证明", channel: "alternative" },
  tomb_cert: { label: "墓址安葬证明", channel: "alternative" },
  crematorium_note: { label: "殡仪馆火化情况说明书", channel: "alternative" },
  // —— 第三梯队：申述辅助材料（特殊申述通道）——
  obituary: { label: "历史讣告", channel: "appeal" },
  old_photo: { label: "老照片", channel: "appeal" },
  tomb_photo: { label: "墓址照片", channel: "appeal" },
  family_record: { label: "家族记载", channel: "appeal" },
  // —— 宗祠基础材料（标准通道，遗体/祠堂特有）——
  clan_relation: { label: "宗族关系证明", channel: "standard" },
  genealogy_record: { label: "族谱记载", channel: "standard" },
  clan_history_photo: { label: "祠堂历史照片/证明", channel: "standard" },
} as const;

export type MaterialType = keyof typeof MATERIAL_TYPES;

/** 单条材料：结构化文本条目 + 可选图片 URL（贴合现有 fireProof 文本化做法） */
export interface MaterialItem {
  type: string;
  label: string;
  value?: string;
  url?: string;
}

/** 最新 proofs 结构（旧 {fireProof,...} 由 normalizeProofs 兼容升级） */
export interface ProofsPayload {
  applicantRealName?: string;
  applicantIdCard: string;
  applicantPhone: string;
  relation: string; // 与逝者/宗族关系
  relationProof?: string; // 亲属/宗族关系证明（编号/URL）
  materials: MaterialItem[];
  promiseLetter?: string; // 真实性承诺书 URL（appeal 必填）
  promiseSigned?: boolean;
}

/** 后台审核卡片 / 可见性判定所需的「馆形态」最小接口 */
export interface HallLike {
  status: string; // pending | active | rejected
  isPublic: boolean;
  reviewChannel?: string | null;
  supplementedAt?: Date | string | null;
  supplementDeadline?: Date | string | null;
}

/** 三通道元信息：所需材料类型、审核方式、时限文案、最低材料数、是否要承诺书 */
export const CHANNEL_META = {
  standard: {
    key: "standard" as ReviewChannel,
    label: "标准通道（法定证明）",
    desc: "持有火化证明 / 死亡医学证明 / 户籍注销证明 / 法院宣告死亡判决书之一即可提交。",
    slaText: "系统自动初核 + 人工抽查，通常 1-3 个工作日",
    materialTypes: ["fireProof", "death_cert", "household_cancellation", "court_death"],
    requireMin: 1,
    requirePromise: false,
  },
  alternative: {
    key: "alternative" as ReviewChannel,
    label: "替代通道（殡葬机构辅助证明）",
    desc: "无上述法定证明时，凭骨灰存放证明 / 墓址安葬证明 / 殡仪馆火化情况说明书之一核验。",
    slaText: "纯人工审核，约 3 个工作日",
    materialTypes: ["ash_storage", "tomb_cert", "crematorium_note"],
    requireMin: 1,
    requirePromise: false,
  },
  appeal: {
    key: "appeal" as ReviewChannel,
    label: "特殊申述通道（年代久远 / 特殊情形）",
    desc: "亲属关系证明 + 真实性承诺书 + 辅助材料（历史讣告 / 老照片 / 墓址照片 / 家族记载）。建馆后 60 天内补传正式材料即可转公开。",
    slaText: "高级复核，5-7 个工作日；仅创建者可见，60 天补传期内可转公开",
    materialTypes: ["obituary", "old_photo", "tomb_photo", "family_record"],
    requireMin: 1,
    requirePromise: true,
  },
} as const;

export type ChannelKey = keyof typeof CHANNEL_META;

/**
 * 公页可见性唯一判据（实时计算，无 cron）：
 *  - 未 active → 不公开（pending/rejected 一律不可见）
 *  - appeal 通道 → 必须「已补传(supplementedAt) 且 isPublic」才公开；否则仅创建者可见
 *  - 其它通道 → 直接看 isPublic
 */
export function effectivePublic(hall: HallLike): boolean {
  if (hall.status !== "active") return false;
  if (hall.reviewChannel === "appeal") return !!hall.supplementedAt && !!hall.isPublic;
  return !!hall.isPublic;
}

export function isAppeal(hall: HallLike): boolean {
  return hall.reviewChannel === "appeal";
}

/** appeal 且已开通但未补传：仍需补传（仅创建者可见） */
export function appealPendingSupplement(hall: HallLike): boolean {
  return isAppeal(hall) && hall.status === "active" && !hall.supplementedAt;
}

/** 补传是否已过 60 天期限（用于前端隐藏补传入口） */
export function supplementDeadlinePassed(
  hall: HallLike,
  now: Date = new Date(),
): boolean {
  if (!hall.supplementDeadline) return false;
  const dl = new Date(hall.supplementDeadline);
  return now.getTime() > dl.getTime();
}

/** 距补传截止还有几天（向上取整；已过期为负数；无期限返回 null） */
export function supplementDueInDays(
  hall: HallLike,
  now: Date = new Date(),
): number | null {
  if (!hall.supplementDeadline) return null;
  const dl = new Date(hall.supplementDeadline);
  const ms = dl.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * 兼容旧 proofs 结构（{ fireProof, applicantIdCard, ... }）→ 新结构（含 materials 列表）。
 * 已是新结构（带 materials）则原样返回；旧结构自动把 fireProof 升级为一条 material。
 */
export function normalizeProofs(raw: unknown): ProofsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const materials = Array.isArray(r.materials)
    ? (r.materials as MaterialItem[])
    : [];
  if (typeof r.fireProof === "string" && r.fireProof.trim()) {
    if (!materials.some((m) => m && m.type === "fireProof")) {
      materials.push({
        type: "fireProof",
        label: MATERIAL_TYPES.fireProof.label,
        value: r.fireProof as string,
      });
    }
  }
  return {
    applicantRealName: typeof r.applicantRealName === "string" ? r.applicantRealName : undefined,
    applicantIdCard: (r.applicantIdCard as string) ?? "",
    applicantPhone: (r.applicantPhone as string) ?? "",
    relation: (r.relation as string) ?? "",
    relationProof: typeof r.relationProof === "string" ? r.relationProof : undefined,
    materials,
    promiseLetter: typeof r.promiseLetter === "string" ? r.promiseLetter : undefined,
    promiseSigned: r.promiseSigned === true,
  };
}

/** 某通道下已提交的有效材料数（value 或 url 至少一个非空） */
export function countMaterialsInChannel(
  proofs: ProofsPayload | null,
  channel: ChannelKey,
): number {
  if (!proofs?.materials?.length) return 0;
  const types = CHANNEL_META[channel].materialTypes as readonly string[];
  return proofs.materials.filter(
    (m) => types.includes(m.type as MaterialType) && (m.value?.trim() || m.url?.trim()),
  ).length;
}

/**
 * 建馆提交校验（合规底线 + 通道材料规则）。返回 { ok, error }。
 * - 任一通道至少 1 项对应材料（不再死守 fireProof）
 * - appeal 还需 relationProof + promiseLetter（真实性承诺书）
 */
export function validateSubmission(
  channel: ChannelKey,
  proofs: ProofsPayload | null,
): { ok: boolean; error?: string } {
  if (!CHANNEL_META[channel]) return { ok: false, error: "无效的审核通道" };
  const meta = CHANNEL_META[channel];
  const n = countMaterialsInChannel(proofs, channel);
  if (n < meta.requireMin) {
    return {
      ok: false,
      error: `请至少提供一项${meta.label}所需的证明材料`,
    };
  }
  if (meta.requirePromise) {
    if (!proofs?.relationProof?.trim()) {
      return { ok: false, error: "特殊申述通道需提供亲属关系证明" };
    }
    if (!proofs?.promiseLetter?.trim()) {
      return { ok: false, error: "特殊申述通道需上传已签署的真实性承诺书" };
    }
  }
  return { ok: true };
}

/** 实名门槛提示文案（建馆前置硬条件，由调用方用 user.idVerified 核查） */
export const REALNAME_REQUIRED_NOTE =
  "建馆需完成实名认证（依据《网络祭祀要求》MZ/T 173—2025，须核验经办人身份与逝者关系）。";
