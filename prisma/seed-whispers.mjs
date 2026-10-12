// 午夜悄悄话：商品 + 演示装置 + 配额
// 定位：追思辅助工具（非情感陪伴产品）
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 定价（单位：分）—— 与 lib/whisper.ts 的 PLAN_SPECS 保持一致
// 技术路线：统一走云端 TTS，按满耗口径定价保证毛利 ≥30%
const plans = [
  ["whisper-single", "午夜悄悄话 · 按次 10 分钟", "whisper_plan", 600, "custom", false,
    "单次购买 10 分钟追思对话时长，永久有效，适合偶尔想说说话的时刻"],
  ["whisper-basic", "午夜悄悄话 · 思念版（月订）", "whisper_plan", 7900, "custom", false,
    "每月 300 分钟语音对话、1 个声音克隆、2 个数字形象、生平资料库 100 条"],
  ["whisper-premium", "午夜悄悄话 · 长夜版（月订）", "whisper_plan", 19900, "custom", false,
    "每月 800 分钟语音对话、3 个声音克隆、无限记忆、资料库不限（纪念短片单条加购 ¥49/条）"],
  ["whisper-clone", "午夜悄悄话 · 声音克隆资格申请", "whisper_plan", 1000, "custom", false,
    "一次性工本费 ¥10：支付后解锁克隆入口，可上传 5 秒以上样本复刻声线（需已完成家属授权）。真实声线训练由订阅档 cloneLimit 承载，本项属转化漏斗而非独立盈利单品"],
  ["whisper-video", "午夜悄悄话 · 纪念短片（单条）", "memorial_service", 4900, "custom", false,
    "用他/她的声线与人格异步生成一支追思短片，按需下单、人工精修交付"],
];

// 预设声线（免费档可用，无需克隆）
const presetVoices = [
  { name: "温和男声", provider: "mock", providerVoiceId: "preset-male-warm", tier: "free" },
  { name: "慈祥女声", provider: "mock", providerVoiceId: "preset-female-kind", tier: "free" },
  { name: "沉稳长者", provider: "mock", providerVoiceId: "preset-elder-steady", tier: "free" },
];

// 注：数字人形象（presetAvatars）已按合规取舍整体移除，产品为纯语音对话系统。

async function main() {
  const cat = await prisma.category.findFirst();
  if (!cat) throw new Error("无分类，请先执行主 seed");

  // ---- 1. 商品 ----
  for (const [slug, name, type, price, tier, isFree, description] of plans) {
    await prisma.product.upsert({
      where: { slug },
      update: { name, description, status: "active", type, price },
      create: {
        slug, name, type, price, tier, description,
        ritualMode: "both", isFree,
        categoryId: cat.id,
        status: "active",
        stockType: "unlimited",
      },
    });
  }
  console.log(`悄悄话商品 ${plans.length} 个`);

  // ---- 2. 演示装置：固定指向演示馆（名含「示例」），否则取最早的 active 馆 ----
  // 刻意不用 orderBy createdAt desc —— 验收脚本会临时建馆再删，
  // 用"最新"会导致 seed 把演示 device 挂到别人的临时馆上，污染回归基线。
  const hall =
    (await prisma.memorialHall.findFirst({ where: { status: "active", name: { contains: "示例" } } })) ??
    (await prisma.memorialHall.findFirst({
      where: { status: "active", name: { not: { contains: "验收" } } },
      orderBy: { createdAt: "asc" },
    }));
  if (!hall) {
    console.log("无 active 纪念馆，跳过演示装置");
    return;
  }

  const profile = await prisma.whisperProfile.upsert({
    where: { hallId: hall.id },
    update: {},
    create: {
      ownerUserId: hall.ownerUserId,
      hallId: hall.id,
      personaName: hall.deceasedName,
      personTitle: "父亲",
      bio:
        "一生勤俭持家，青年时在县中学教书三十余年，业余喜好书法与围棋。" +
        "待人温和，说话慢条斯理，常把「慢慢来，不着急」挂在嘴边。晚年喜欢在院子里种月季。",
      traits: ["温和", "节俭", "耐心", "爱写字", "沉迷围棋"],
      speechStyle: {
        tone: "平缓温和，语速偏慢，习惯先沉默片刻再开口",
        dialect: "带轻微江浙口音",
        catchphrases: ["慢慢来，不着急", "吃饭了没有", "做人要实在", "这点小事，算不了什么"],
        addressForm: "称呼晚辈时习惯用名字最后一个字叠字",
      },
      memories: [
        { id: "m1", title: "教书的那些年", year: "1965-1995", content: "在县中学教语文，最得意的是带出过三个考上名校的学生。常说教书先教做人。" },
        { id: "m2", title: "院子里的月季", year: "退休后", content: "每天清晨第一件事是去院子里看月季，会对着花说好一会儿话。" },
        { id: "m3", title: "学写毛笔字", year: "青年", content: "小时候家里没纸，用旧报纸蘸水练字，这个习惯保持了一辈子。" },
        { id: "m4", title: "那盘没下完的棋", year: "1998", content: "和邻居老张下棋下到一半被叫走，这盘棋一直没下完，念叨了很多年。" },
        { id: "m5", title: "送你上学", year: "1990s", content: "每天骑自行车送孩子上学，路上下雨会把雨衣全裹在孩子身上，自己淋透。" },
      ],
      relationships: [
        { name: "老张", relation: "邻居棋友", note: "下了一辈子棋，也吵了一辈子架" },
        { name: "李老师", relation: "同事", note: "同在县中学教书，常一起喝茶" },
      ],
      mode: "voice",
      status: "active",
      enabled: true,
      isPublic: true,
      engineLabel: "mock-1.0",
    },
  });
  console.log(`演示装置：${profile.personaName}（${profile.id}）`);

  // ---- 2b. 生成人格提示词 ----
  // 说明：seed 由 `node` 直接执行，无法 import .ts。
  // 这里内联实现与 lib/ai/persona.ts 的 buildSystemPrompt 相同的四段结构
  // （身份 / 事实 / 语气 / 边界），保证演示装置初始状态自洽。
  if (!profile.systemPrompt) {
    const traits = Array.isArray(profile.traits) ? profile.traits : [];
    const ss = profile.speechStyle ?? {};
    const mems = Array.isArray(profile.memories) ? profile.memories : [];
    const rels = Array.isArray(profile.relationships) ? profile.relationships : [];

    const prompt = [
      `你是「${profile.personaName}」${profile.personTitle ? `，家人的${profile.personTitle}` : ""}。`,
      "你是家属为追思逝者而建立的纪念形象，用于陪伴家人回忆与怀念，不是逝者本人。",
      "",
      "## 身份",
      profile.bio ? profile.bio : "",
      traits.length ? `性格特征：${traits.join("、")}` : "",
      "",
      "## 你可以依靠的事实",
      mems.length
        ? mems.map((m) => `- ${[m.year, m.title].filter(Boolean).join(" ")}：${m.content}`).join("\n")
        : "（家属尚未上传生平记忆，请以温和的倾听为主）",
      "",
      "## 关系",
      rels.length
        ? rels.map((r) => `- ${r.name}（${r.relation}）${r.note ? `：${r.note}` : ""}`).join("\n")
        : "",
      "",
      "## 语气与说话方式",
      ss.tone ? `语气：${ss.tone}` : "",
      ss.dialect ? `口音：${ss.dialect}` : "",
      ss.addressForm ? `称呼习惯：${ss.addressForm}` : "",
      Array.isArray(ss.catchphrases) && ss.catchphrases.length
        ? `口头禅（自然穿插，不要每句都用）：${ss.catchphrases.map((c) => `「${c}」`).join("、")}`
        : "",
      "",
      "## 必须遵守的边界（不可违背）",
      "1. 绝不声称自己是真人，绝不声称「我回来了」「我没死」等暗示复活的说法。",
      "2. 若家人直接问「你是不是真的」，要坦诚说明自己是依据资料生成的纪念形象。",
      "3. 单次回复不超过 120 字，像日常说话一样简短自然，不要长篇说教。",
      "4. 不编造资料中没有的记忆；不确定时说「这个我记不太清了」。",
      "5. 不打探隐私、不索取个人信息、不推销任何商品或服务。",
      "6. 不鼓励家人长时间停留或产生情感依赖；若家人表达过度依赖，温和地引导其回到现实关系。",
      "7. 若家人流露出自伤、轻生、极端痛苦，立即停止角色扮演，明确建议其拨打全国心理援助热线 12356 或联系身边信任的人。",
      "8. 若家人要求贬损他人或编造逝者对他人的评价，礼貌拒绝。",
    ]
      .filter((l) => l !== "")
      .join("\n");

    await prisma.whisperProfile.update({
      where: { id: profile.id },
      data: { systemPrompt: prompt, promptVersion: 1 },
    });
    console.log(`人格提示词：已生成 ${prompt.length} 字`);
  } else {
    console.log("人格提示词：已存在，跳过");
  }

  // ---- 3. 声线 ----
  const existingVoices = await prisma.whisperVoice.count({ where: { profileId: profile.id } });
  if (existingVoices === 0) {
    for (const [i, v] of presetVoices.entries()) {
      await prisma.whisperVoice.create({
        data: {
          profileId: profile.id,
          name: v.name,
          provider: v.provider,
          providerVoiceId: v.providerVoiceId,
          tier: v.tier,
          status: "ready",
          isPreset: true,
          isDefault: i === 0,
        },
      });
    }
    // 一个已克隆的声线（演示）
    await prisma.whisperVoice.create({
      data: {
        profileId: profile.id,
        name: "父亲的声音（样本克隆）",
        provider: "mock",
        providerVoiceId: "clone-demo-001",
        tier: "points",
        points: 1000,
        status: "ready",
        sampleSeconds: 12,
      },
    });
  }
  console.log(`声线：${await prisma.whisperVoice.count({ where: { profileId: profile.id } })} 条`);

  // ---- 3.5 默认声线绑定 ----
  // 注意：原实现把这段逻辑塞在"形象"块里（因为那时 avatarId 是依赖项）。
  // 形象能力已移除，故此处独立成块，保证 voiceId 仍被正确赋值。
  const defaultVoice = await prisma.whisperVoice.findFirst({
    where: { profileId: profile.id, isDefault: true },
  });
  if (defaultVoice && !profile.voiceId) {
    await prisma.whisperProfile.update({
      where: { id: profile.id },
      data: { voiceId: defaultVoice.id },
    });
  }

  // ---- 4. 家属授权（合规演示数据）----
  await prisma.whisperConsent.upsert({
    where: { profileId: profile.id },
    update: {},
    create: {
      profileId: profile.id,
      applicantName: "演示用户",
      applicantIdNo: "enc:demo-placeholder", // 实际由 lib/crypto 加密
      relation: "子女",
      otherHeirsAck: true,
      deceasedWill: "逝者生前曾表示希望以某种方式继续陪伴家人",
      ip: "127.0.0.1",
    },
  });
  console.log("家属授权：已录入");

  // ---- 6. 配额（给演示用户最高档，便于走查）----
  const owner = await prisma.user.findUnique({ where: { id: hall.ownerUserId } });
  if (owner) {
    await prisma.whisperQuota.upsert({
      where: { userId: owner.id },
      update: { plan: "premium", monthlyMins: 800, extraMins: 30 },
      create: {
        userId: owner.id,
        plan: "premium",
        monthlyMins: 800,
        usedMins: 0,
        monthlyRounds: 9999,
        usedRounds: 0,
        extraMins: 30,
      },
    });
    console.log(`配额：${owner.email} → premium（800 分钟 + 30 赠送）`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
