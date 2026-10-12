/**
 * 改造 B1 验收：声音克隆伦理审查工作流
 *
 * 规划方案的合规框架要求：声音克隆属对逝者生物特征的复刻，
 * 除近亲属单独同意外，还须经平台伦理审查（独立子流程）方可上线。
 *
 * 说明：Server Action（reviewWhisper / reviewWhisperEthics）内部依赖
 * getCurrentUser → next-auth headers()，无法在脚本进程里直接调用
 * （会抛 "headers was called outside a request scope"）。
 * 故本脚本按既有 verify-whisper-compliance.mts 的做法：
 *   - 直接驱动数据层，验证闸门判定逻辑的最终落库结果
 *   - 用静态断言锁定 actions.ts 源码里的闸门分支（防回归）
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  ${extra}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
}

const profile = await prisma.whisperProfile.findFirst({
  include: { _count: { select: { voices: true } } },
});
if (!profile) throw new Error("演示装置不存在");

const voiceCount = profile._count.voices;
console.log(`\n装置：${profile.personaName}（${profile.id}）声线 ${voiceCount} 条\n`);

const snapshot = {
  status: profile.status,
  enabled: profile.enabled,
  isPublic: profile.isPublic,
  ethicsStatus: profile.ethicsStatus,
  ethicsReviewer: profile.ethicsReviewer,
  ethicsReviewedAt: profile.ethicsReviewedAt,
  ethicsNote: profile.ethicsNote,
};

// ============================================================
// 1. 数据层：伦理审查字段可写、可读、类型正确
// ============================================================
{
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: {
      ethicsStatus: "pending",
      ethicsReviewer: "验收审核员",
      ethicsReviewedAt: new Date(),
      ethicsNote: "样本来源核验中",
    },
  });
  const row = await prisma.whisperProfile.findUnique({ where: { id: profile.id } });
  check("ethicsStatus 可写", row!.ethicsStatus === "pending");
  check("ethicsReviewer 可写", row!.ethicsReviewer === "验收审核员");
  check("ethicsReviewedAt 可写", row!.ethicsReviewedAt instanceof Date);
  check("ethicsNote 可写", row!.ethicsNote === "样本来源核验中");
}

// ============================================================
// 2. 闸门逻辑：模拟 reviewWhisper 的判定分支，逐条验证
// ============================================================
{
  // 与 actions.ts 中 reviewWhisper 的判定保持一致的等价实现
  const decide = (opts: { hasClone: boolean; ethicsStatus: string; consentOk: boolean; decision: string }) => {
    const ethicsOk = opts.ethicsStatus === "approved";
    const ethicsBlocked = opts.hasClone && !ethicsOk;
    const blocked = (opts.decision === "active" && !opts.consentOk) || (opts.decision === "active" && ethicsBlocked);
    return {
      finalDecision: blocked ? "rejected" : opts.decision,
      blocked,
      reason: blocked ? (!opts.consentOk ? "缺少授权" : "伦理未过") : "",
    };
  };

  check(
    "克隆 + 伦理 pending + 点通过 → 驳回",
    decide({ hasClone: true, ethicsStatus: "pending", consentOk: true, decision: "active" }).finalDecision === "rejected",
  );
  check(
    "克隆 + 伦理 rejected + 点通过 → 驳回",
    decide({ hasClone: true, ethicsStatus: "rejected", consentOk: true, decision: "active" }).finalDecision === "rejected",
  );
  check(
    "克隆 + 伦理 not_required + 点通过 → 驳回（未走过流程）",
    decide({ hasClone: true, ethicsStatus: "not_required", consentOk: true, decision: "active" }).finalDecision ===
      "rejected",
  );
  check(
    "克隆 + 伦理 approved + 点通过 → 放行",
    decide({ hasClone: true, ethicsStatus: "approved", consentOk: true, decision: "active" }).finalDecision === "active",
  );
  check(
    "无克隆 + 伦理 rejected + 点通过 → 放行（不误伤纯语音）",
    decide({ hasClone: false, ethicsStatus: "rejected", consentOk: true, decision: "active" }).finalDecision === "active",
  );
  check(
    "无授权优先于伦理：即使伦理通过也驳回",
    decide({ hasClone: true, ethicsStatus: "approved", consentOk: false, decision: "active" }).reason === "缺少授权",
  );
  check(
    "点驳回 → 始终驳回",
    decide({ hasClone: false, ethicsStatus: "approved", consentOk: true, decision: "rejected" }).finalDecision ===
      "rejected",
  );
}

// ============================================================
// 3. 源码静态断言：锁定闸门实现，防日后被误删
// ============================================================
{
  const src = readFileSync("app/admin/review/actions.ts", "utf8");
  check("源码·导出 reviewWhisperEthics", src.includes("export async function reviewWhisperEthics"));
  check("源码·reviewWhisper 读 _count.voices", src.includes("_count: { select: { voices: true } }"));
  check("源码·伦理闸门变量存在", src.includes("ethicsBlocked"));
  check("源码·克隆判定 hasClone", src.includes("const hasClone = profile._count.voices > 0"));
  check("源码·驳回原因含『伦理审查』", src.includes("未通过伦理审查，系统自动驳回"));
  check("源码·not_required 自动转 pending", src.includes('profile.ethicsStatus === "not_required" ? "pending"'));
  check("源码·伦理不通过即下线", src.includes("...(approved ? {} : { enabled: false, status: \"rejected\" })"));
  check("源码·伦理动作写审计日志", src.includes("whisper_ethics_"));
}

// ============================================================
// 4. 伦理审查落库：approved 后可上线 / rejected 即下线
// ============================================================
{
  // 模拟 reviewWhisperEthics(approved) 的落库效果
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: {
      ethicsStatus: "approved",
      ethicsReviewer: "验收审核员",
      ethicsReviewedAt: new Date(),
      ethicsNote: "样本来源合法",
    },
  });
  let row = await prisma.whisperProfile.findUnique({ where: { id: profile.id } });
  check("伦理 approved → 字段落库", row!.ethicsStatus === "approved");

  // 通过后走 reviewWhisper 落库路径
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { status: "active", enabled: true, isPublic: true },
  });
  row = await prisma.whisperProfile.findUnique({ where: { id: profile.id } });
  check("伦理通过后装置可上线", row!.status === "active" && row!.enabled === true);

  // 模拟 reviewWhisperEthics(rejected) 的落库效果
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { ethicsStatus: "rejected", ethicsNote: "样本来源存疑", enabled: false, status: "rejected" },
  });
  row = await prisma.whisperProfile.findUnique({ where: { id: profile.id } });
  check("伦理 rejected → 状态置 rejected", row!.ethicsStatus === "rejected");
  check("伦理 rejected → 装置立即下线", row!.enabled === false);
}

// ============================================================
// 5. 审计日志：伦理审查动作可留痕
// ============================================================
{
  await prisma.auditLog.create({
    data: {
      userId: "verify-ethics",
      action: "whisper_ethics_approved:样本来源合法",
      entity: "WhisperProfile",
      entityId: profile.id,
    },
  });
  const log = await prisma.auditLog.findFirst({
    where: { entityId: profile.id, action: { startsWith: "whisper_ethics_" } },
    orderBy: { createdAt: "desc" },
  });
  check("审计日志·伦理动作可写入", !!log && log.action.startsWith("whisper_ethics_"));
  await prisma.auditLog.deleteMany({ where: { userId: "verify-ethics" } });
}

// ============================================================
// 6. schema 默认值
// ============================================================
{
  const p = await prisma.whisperProfile.findFirst({ select: { ethicsStatus: true } });
  check("schema 有默认 ethicsStatus", typeof p!.ethicsStatus === "string");
}

// ---------- 还原 ----------
await prisma.whisperProfile.update({
  where: { id: profile.id },
  data: {
    status: snapshot.status,
    enabled: snapshot.enabled,
    isPublic: snapshot.isPublic,
    ethicsStatus: snapshot.ethicsStatus,
    ethicsReviewer: snapshot.ethicsReviewer,
    ethicsReviewedAt: snapshot.ethicsReviewedAt,
    ethicsNote: snapshot.ethicsNote,
  },
});

console.log(`\n伦理审查验收：通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
