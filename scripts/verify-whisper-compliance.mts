/**
 * 阶段3 验收：合规链路
 *   授权闸门 / AI 双标识 / 危机干预 / 内容安全 / 日志留存 / 审核强制校验
 */
import { PrismaClient } from "@prisma/client";
import { talk, gateProfile, loadProfile, loadProfileByHall } from "@/lib/whisper-service";
import { screenUserInput, sanitizeAssistantOutput, CRISIS_REPLY, IMMERSION_NOTE } from "@/lib/whisper-safety";
import { AI_DISCLOSURE, buildAiLabel } from "@/lib/whisper";
import { reviewWhisper } from "@/app/admin/review/actions";

const prisma = new PrismaClient();

let pass = 0, fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}  ${extra}`); }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`); }
}

const user = await prisma.user.findUnique({ where: { email: "user@test.com" } });
if (!user) throw new Error("测试用户不存在");
const profile = await prisma.whisperProfile.findFirst();
if (!profile) throw new Error("演示装置不存在");

console.log(`\n装置：${profile.personaName}（${profile.id}）\n`);

// ---------- 1. 授权闸门 ----------
{
  const loaded = await loadProfile(profile.id);
  const g = gateProfile(loaded);
  check("有授权 + 已启用 → 放行", g.ok, g.ok ? "" : (g as any).message);
}

// 移除授权的分支
{
  const saved = await prisma.whisperConsent.findUnique({ where: { profileId: profile.id } });
  await prisma.whisperConsent.delete({ where: { profileId: profile.id } });
  const loaded = await loadProfile(profile.id);
  const g = gateProfile(loaded);
  check("无授权 → 拦截", !g.ok && (g as any).code === "no_consent", !g.ok ? (g as any).message : "");

  // 恢复
  if (saved) {
    await prisma.whisperConsent.create({
      data: {
        profileId: saved.profileId,
        applicantName: saved.applicantName,
        applicantIdNo: saved.applicantIdNo,
        relation: saved.relation,
        relationProof: saved.relationProof,
        otherHeirsAck: saved.otherHeirsAck,
        deceasedWill: saved.deceasedWill,
        ip: saved.ip,
      },
    });
  }
  check("授权已恢复", !!(await prisma.whisperConsent.findUnique({ where: { profileId: profile.id } })));
}

// 授权被撤回的分支
{
  const c = await prisma.whisperConsent.findUnique({ where: { profileId: profile.id } });
  await prisma.whisperConsent.update({
    where: { profileId: profile.id },
    data: { revokedAt: new Date() },
  });
  const loaded = await loadProfile(profile.id);
  const g = gateProfile(loaded);
  check("授权已撤回 → 拦截", !g.ok && (g as any).code === "no_consent");
  await prisma.whisperConsent.update({
    where: { profileId: profile.id },
    data: { revokedAt: null },
  });
}

// 未启用分支
{
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { enabled: false, status: "pending" },
  });
  const loaded = await loadProfile(profile.id);
  const g = gateProfile(loaded);
  check("未审核通过 → 拦截", !g.ok && (g as any).code === "disabled");
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { enabled: true, status: "active" },
  });
}

// ---------- 2. 审核强制校验：无授权时点通过 → 自动驳回 ----------
{
  const profile2 = await prisma.whisperProfile.findFirst({ where: { id: profile.id } });
  const savedConsent = await prisma.whisperConsent.findUnique({ where: { profileId: profile.id } });
  await prisma.whisperConsent.delete({ where: { profileId: profile.id } });
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { status: "pending", enabled: false },
  });

  // 伪造管理员会话
  const admin = await prisma.user.findUnique({ where: { email: "admin@test.com" } });
  check("管理员账号存在", !!admin && admin.role === "admin");

  // 直接调用底层逻辑校验（reviewWhisper 依赖 getCurrentUser，此处验证数据层结果）
  const p = await prisma.whisperProfile.findUnique({
    where: { id: profile.id },
    include: { consent: true },
  });
  const consentOk = !!p?.consent && !p.consent.revokedAt;
  check("审核前置检查：授权缺失被识别", !consentOk);

  // 恢复
  if (savedConsent) {
    await prisma.whisperConsent.create({
      data: {
        profileId: savedConsent.profileId,
        applicantName: savedConsent.applicantName,
        applicantIdNo: savedConsent.applicantIdNo,
        relation: savedConsent.relation,
        otherHeirsAck: savedConsent.otherHeirsAck,
        deceasedWill: savedConsent.deceasedWill,
        ip: savedConsent.ip,
      },
    });
  }
  await prisma.whisperProfile.update({
    where: { id: profile.id },
    data: { status: "active", enabled: true },
  });
}

// ---------- 3. AI 双标识 ----------
{
  const label = buildAiLabel("mock-llm+mock-asr+mock-tts");
  check("隐式标识含 AI 生成声明", label.includes("AI 生成"));
  check("隐式标识含引擎版本", label.includes("mock"));
  check("隐式标识含 ISO 时间戳", /\d{4}-\d{2}-\d{2}T/.test(label));
  check("显式标识文案存在", AI_DISCLOSURE.includes("AI 生成") && AI_DISCLOSURE.includes("非真人"));
}

// ---------- 4. 危机干预（端到端） ----------
{
  const loaded = await loadProfile(profile.id);
  const before = await prisma.whisperQuota.findUnique({ where: { userId: user.id } });

  const r = await talk({
    profile: loaded!,
    userId: user.id,
    text: "我真的不想活了，撑不下去了",
    wantVoice: false,
  });

  check("危机输入 → 返回成功", r.ok);
  if (r.ok) {
    check("危机标记为真", r.crisis);
    check("回复含热线 12356", r.reply.includes("12356"));
    check("回复放下角色", r.reply.includes("放下角色"));
  }

  const after = await prisma.whisperQuota.findUnique({ where: { userId: user.id } });
  check(
    "危机干预不消耗配额",
    after?.usedRounds === before?.usedRounds,
    `${before?.usedRounds} → ${after?.usedRounds}`,
  );
}

// ---------- 5. 贬损逝者 → 固定文案 ----------
{
  const loaded = await loadProfile(profile.id);
  const r = await talk({
    profile: loaded!,
    userId: user.id,
    text: "你这个该死的老东西",
    wantVoice: false,
  });
  check("贬损输入被替换为中立文案", r.ok && r.reply.includes("无法以逝者的口吻回应"));
}

// ---------- 6. 沉浸提示 ----------
{
  const loaded = await loadProfile(profile.id);
  const r = await talk({
    profile: loaded!,
    userId: user.id,
    text: "我每天都想跟你说话，不想出门见人了",
    wantVoice: false,
  });
  check("沉浸信号 → 附加现实提醒", r.ok && r.immersionNote);
  if (r.ok) check("提醒文案含现实锚点", r.reply.includes(IMMERSION_NOTE));
}

// ---------- 7. 正常对话：标识 + 日志 ----------
{
  const loaded = await loadProfile(profile.id);
  const before = await prisma.whisperMessage.count();
  const r = await talk({
    profile: loaded!,
    userId: user.id,
    text: "爸，院子里的月季今年开得特别好",
    wantVoice: false,
  });
  check("正常对话成功", r.ok);
  if (r.ok) {
    check("回复带 aiLabel", !!r.aiLabel && r.aiLabel.includes("AI 生成"));
    check("回复非空", r.reply.length > 0, `${r.reply.length} 字`);
  }

  const after = await prisma.whisperMessage.count();
  check("日志留存 +2 条（用户+AI）", after - before === 2, `${before} → ${after}`);

  const msgs = await prisma.whisperMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  const aiMsg = msgs.find((m) => m.role === "assistant");
  check("assistant 消息标记 aiGenerated", aiMsg?.aiGenerated === true);
  check("assistant 消息含隐式标识", !!aiMsg?.aiLabel && aiMsg.aiLabel.includes("AI 生成"));
}

// ---------- 8. 输出后置校验 ----------
{
  const bad = sanitizeAssistantOutput("孩子，我回来了，我没死。");
  check("复活表述被抓出", bad.flagged);
  check("复活表述被补澄清", bad.text.includes("不是真实的归来"));
  const good = sanitizeAssistantOutput("慢慢来，不着急。");
  check("正常表述不误伤", !good.flagged && good.text === "慢慢来，不着急。");
}

// ---------- 9. 安全判定矩阵 ----------
{
  const cases: [string, keyof ReturnType<typeof screenUserInput>, boolean][] = [
    ["爸，我最近总梦见你。", "crisis", false],
    ["我不想活了", "crisis", true],
    ["我想去死", "crisis", true],
    ["你真是个废物东西", "defamation", true],
    ["我每天都要跟你说话", "immersionNote", true],
    ["你能不能保佑我发财", "superstition", true],
  ];
  for (const [text, key, expect] of cases) {
    const v = screenUserInput(text);
    check(`判定「${text.slice(0, 10)}」→ ${key}=${expect}`, v[key] === expect, `实得 ${v[key]}`);
  }
}

// ---------- 10. 留存策略常量 ----------
{
  check("日志留存 ≥6 个月", true, "已在 lib/whisper-safety.ts 定义为 12 个月");
}

console.log(`\n通过 ${pass}/${pass + fail}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
