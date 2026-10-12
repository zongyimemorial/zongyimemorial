// 演示数据种子（内测用，仅测试账号，不收真实敏感信息）
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash("admin123456", 10);
  const userPwd = await bcrypt.hash("user123456", 10);

  // 普通管理员默认模块权限（与 lib/permissions.ts 中 admin 角色的 ROLE_PERMISSIONS 一致）。
  // 显式写入 permissions 字段，便于账号管理页「模块权限设置」直接呈现，且数据自检无需依赖角色默认回退。
  const ADMIN_DEFAULT_PERMS = [
    "monitor", "content", "products", "orders", "live", "activities", "review",
    "ledger_halls", "ledger_clans", "points", "services", "whispers",
    "memorial_review",
  ];

  // 演示账号
  const admin = await prisma.user.upsert({
    where: { email: "admin@test.com" },
    update: { passwordHash: adminPwd, permissions: ADMIN_DEFAULT_PERMS },
    create: {
      email: "admin@test.com",
      passwordHash: adminPwd,
      realName: "测试管理员",
      role: "admin",
      status: "active",
      permissions: ADMIN_DEFAULT_PERMS,
    },
  });
  // ⚠️ 密码用 update 强制回写（不是 update:{}）：
  //    验收脚本依赖 user123456 / admin123456 登录，若历史上被改过就会全部红掉。
  //    seed 的职责是把环境拉回已知良好状态，故此处显式重置。
  const user = await prisma.user.upsert({
    where: { email: "user@test.com" },
    update: { passwordHash: userPwd },
    create: {
      email: "user@test.com",
      passwordHash: userPwd,
      realName: "测试用户",
      role: "user",
      status: "active",
    },
  });

  // 管理员账号体系（需求：管理后台最多 3 个管理员账号 = 1 超级管理员 + 2 普通管理员）
  // ⚠️ admin@test.com 保持 role=admin 不变（verify-whisper-compliance 断言其角色为 admin）。
  //    超管为独立账号 superadmin@test.com，第二个普通管理员为 admin2@test.com。
  //    三个管理账号统一用 admin123456，与现有演示账号约定一致，便于验收登录。
  await prisma.user.upsert({
    where: { email: "superadmin@test.com" },
    update: { passwordHash: adminPwd },
    create: {
      email: "superadmin@test.com",
      passwordHash: adminPwd,
      realName: "超级管理员",
      role: "super_admin",
      status: "active",
      // 超级管理员权限由角色固定为全部，permissions 留空（不依赖该字段）
    },
  });
  await prisma.user.upsert({
    where: { email: "admin2@test.com" },
    update: { passwordHash: adminPwd, permissions: ADMIN_DEFAULT_PERMS },
    create: {
      email: "admin2@test.com",
      passwordHash: adminPwd,
      realName: "测试管理员二",
      role: "admin",
      status: "active",
      permissions: ADMIN_DEFAULT_PERMS,
    },
  });

  // 内测演示账号统一发放积分，便于体验积分兑换
  await prisma.user.update({
    where: { email: "admin@test.com" },
    data: { points: 3000 },
  });
  await prisma.user.update({
    where: { email: "user@test.com" },
    data: { points: 5000 },
  });

  // 新闻栏目
  const catAnn = await prisma.category.upsert({
    where: { slug: "announcement" },
    update: {},
    create: { name: "平台公告", slug: "announcement", sort: 1 },
  });
  const catCulture = await prisma.category.upsert({
    where: { slug: "culture" },
    update: {},
    create: { name: "殡葬文化", slug: "culture", sort: 2 },
  });
  const catPolicy = await prisma.category.upsert({
    where: { slug: "policy" },
    update: {},
    create: { name: "政策解读", slug: "policy", sort: 3 },
  });
  const catStory = await prisma.category.upsert({
    where: { slug: "story" },
    update: {},
    create: { name: "追思故事", slug: "story", sort: 4 },
  });
  // 商品栏目
  const catVirtual = await prisma.category.upsert({
    where: { slug: "virtual" },
    update: {},
    create: { name: "虚拟纪念", slug: "virtual", sort: 10 },
  });
  const catSupplies = await prisma.category.upsert({
    where: { slug: "supplies" },
    update: {},
    create: { name: "祭祀用品", slug: "supplies", sort: 20 },
  });

  // 示例文章
  const articles = [
    {
      slug: "welcome",
      categoryId: catAnn.id,
      title: "宗忆堂平台内测上线公告",
      summary: "我们以数字方式，留存思念，传递敬意。内测版本已开放，欢迎体验。",
      body: "## 内测公告\n\n我们以数字方式，留存思念，传递敬意。本平台正处于**不公开内部测试**阶段，用于验证新闻、虚拟纪念、云祭扫等核心功能。\n\n- 新闻发布与内容体系\n- 数字纪念馆与云祭扫\n- 虚拟献花、点灯等纪念服务\n\n感谢每一位体验者的反馈。",
      seoTitle: "宗忆堂平台内测上线公告",
      seoKeywords: "宗忆堂,内测,数字纪念",
      seoDescription: "宗忆堂平台内测上线，提供数字纪念馆、云祭扫与虚拟献花服务。",
    },
    {
      slug: "memorial-culture",
      categoryId: catCulture.id,
      title: "清明数字祭扫：传统礼仪的数字化延续",
      summary: "从焚香到云端点灯，祭扫的形式在变，追思的心意不变。",
      body: "## 数字祭扫的文化意义\n\n清明祭扫是慎终追远的传统。数字纪念并非取代实地祭扫，而是为远在他乡、行动不便的人们提供一份**可随时抵达的思念**。\n\n云祭扫、虚拟献花，是礼仪在数字时代的自然延伸。",
      seoTitle: "清明数字祭扫：传统礼仪的数字化延续",
      seoKeywords: "清明,数字祭扫,云祭扫",
      seoDescription: "探讨数字祭扫如何延续传统礼仪，为远方的思念提供归处。",
    },
    {
      slug: "policy-icp",
      categoryId: catPolicy.id,
      title: "网站备案与合规要点解读",
      summary: "Web 端上线前需完成 ICP 备案，内容需规避封建迷信红线。",
      body: "## 合规要点\n\n- 网站用途填写“文化传播/数字纪念”，**不要**写“殡葬服务”\n- 公开内容先过机审，再人工终审\n- 虚拟商品避免抽卡/盲盒机制\n\n备案是上线的第一步，也是合规的基础。",
      seoTitle: "网站备案与合规要点解读",
      seoKeywords: "ICP备案,合规,数字纪念",
      seoDescription: "解读殡葬祭祀类网站的 ICP 备案与内容合规要点。",
    },
  ];
  for (const a of articles) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        ...a,
        authorId: admin.id,
        status: "published",
        isAiGenerated: false,
        viewCount: Math.floor(Math.random() * 200),
        publishedAt: new Date(),
      },
    });
  }

  // 虚拟商品
  const products = [
    {
      slug: "digital-memorial-hall",
      name: "数字纪念馆（一年）",
      type: "memorial_hall",
      price: 9800,
      description: "为逝者建立专属的线上纪念空间，可上传生平、照片，供亲友随时随地追思缅怀。",
      seoTitle: "数字纪念馆",
      seoKeywords: "数字纪念馆,宗忆堂馆",
      seoDescription: "建立专属线上纪念空间，留存生平与思念。",
    },
    {
      slug: "cloud-worship",
      name: "云祭扫服务",
      type: "cloud_worship",
      price: 3900,
      description: "代客献花、点灯、诵读追思词的在线祭扫服务，由礼仪人员协助完成。",
      seoTitle: "云祭扫服务",
      seoKeywords: "云祭扫,在线祭扫",
      seoDescription: "在线云祭扫，代客献花点灯，传递敬意。",
    },
    {
      slug: "virtual-flower",
      name: "虚拟献花",
      type: "virtual_flower",
      price: 600,
      description: "在数字纪念馆献上一束虚拟鲜花，表达思念与敬意。",
      seoTitle: "虚拟献花",
      seoKeywords: "虚拟献花,在线献花",
      seoDescription: "在数字纪念馆献上虚拟鲜花，表达思念。",
    },
    {
      slug: "online-lamp",
      name: "在线点灯",
      type: "tribute_item",
      price: 300,
      description: "点亮一盏长明灯，愿思念长明。",
      seoTitle: "在线点灯",
      seoKeywords: "在线点灯,长明灯",
      seoDescription: "点亮在线长明灯，寄托思念。",
    },
    {
      slug: "incense-offering",
      name: "祭祀香烛礼盒",
      type: "physical_goods",
      price: 8800,
      description: "环保香烛与祭品礼盒，顺丰包邮，适用于清明、忌日祭扫。",
      seoTitle: "祭祀香烛礼盒",
      seoKeywords: "祭祀香烛,祭品",
      seoDescription: "环保祭祀香烛礼盒，顺丰包邮。",
    },
    {
      slug: "flower-basket",
      name: "仿真花圈",
      type: "physical_goods",
      price: 12800,
      description: "高仿真花圈，庄重肃穆，支持定制挽联，全国配送。",
      seoTitle: "仿真花圈",
      seoKeywords: "仿真花圈,挽联",
      seoDescription: "高仿真花圈，支持定制挽联，全国配送。",
    },
  ];

  // 扩充虚拟纪念产品线（含纪念服务类）
  const virtualExtra = [
    {
      slug: "family-memorial-hall",
      name: "家族纪念馆（三年）",
      type: "memorial_hall",
      price: 19800,
      pointsPrice: 19800,
      description: "为整个家族建立的共享纪念空间，支持多位逝者生平与家族谱系，三年有效。",
      seoTitle: "家族纪念馆",
      seoKeywords: "家族纪念馆,家族纪念",
      seoDescription: "为家族建立的共享数字纪念空间。",
    },
    {
      slug: "memorial-renew",
      name: "纪念馆续费（一年）",
      type: "memorial_hall",
      price: 6800,
      pointsPrice: 6800,
      description: "为已开通的数字纪念馆续费一年，延续思念的归处。",
      seoTitle: "纪念馆续费",
      seoKeywords: "纪念馆续费",
      seoDescription: "数字纪念馆续费一年。",
    },
    {
      slug: "bio-writing",
      name: "生平传记代写",
      type: "memorial_service",
      price: 19800,
      pointsPrice: 19800,
      description: "由专业文案根据亲友口述与生平等素材，撰写一篇庄重得体的生平传记，约 2000 字。",
      seoTitle: "生平传记代写",
      seoKeywords: "生平传记,传记代写",
      seoDescription: "专业生平传记代写服务。",
    },
    {
      slug: "online-memorial-meeting",
      name: "线上追思会（直播）",
      type: "memorial_service",
      price: 12800,
      pointsPrice: 12800,
      description: "为亲友举办一场线上追思会，提供直播房间、主持串词与留言墙，远端亲友皆可参加。",
      seoTitle: "线上追思会",
      seoKeywords: "线上追思会,追思直播",
      seoDescription: "举办线上追思会直播。",
    },
    {
      slug: "memorial-video",
      name: "追思纪念视频制作",
      type: "memorial_service",
      price: 8800,
      pointsPrice: 8800,
      description: "将照片、影像与音乐剪辑成一支 3 分钟追思纪念视频，可供纪念馆与亲友分享。",
      seoTitle: "追思纪念视频",
      seoKeywords: "纪念视频,追思视频",
      seoDescription: "定制追思纪念视频。",
    },
    {
      slug: "e-obituary",
      name: "电子讣告发布",
      type: "memorial_service",
      price: 2900,
      pointsPrice: 2900,
      description: "在线发布电子讣告/讣闻，生成可分享的缅怀页，免去纸质讣告奔波。",
      seoTitle: "电子讣告",
      seoKeywords: "电子讣告,讣闻",
      seoDescription: "在线发布电子讣告。",
    },
    {
      slug: "qr-tombstone",
      name: "扫码云碑（二维码铭牌）",
      type: "memorial_service",
      price: 4900,
      pointsPrice: 4900,
      description: "一枚可张贴于墓碑或相框的二维码铭牌，扫码即达专属宗忆堂馆，让思念随时可达。",
      seoTitle: "扫码云碑",
      seoKeywords: "扫码云碑,二维码铭牌",
      seoDescription: "扫码即达宗忆堂馆的二维码铭牌。",
    },
    {
      slug: "lamp-year",
      name: "电子长明灯（年卡）",
      type: "tribute_item",
      price: 980,
      pointsPrice: 980,
      description: "点亮一盏全年不灭的电子长明灯，愿思念长明，每日自动续灯。",
      seoTitle: "电子长明灯年卡",
      seoKeywords: "电子长明灯,长明灯年卡",
      seoDescription: "全年不灭的电子长明灯。",
    },
    {
      slug: "virtual-wreath",
      name: "虚拟挽联",
      type: "virtual_flower",
      price: 900,
      pointsPrice: 900,
      description: "在数字纪念馆敬献一副虚拟挽联，表达庄重哀思。",
      seoTitle: "虚拟挽联",
      seoKeywords: "虚拟挽联,在线挽联",
      seoDescription: "在线敬献虚拟挽联。",
    },
  ];

  for (const p of products) {
    const categoryId = p.type === "physical_goods" ? catSupplies.id : catVirtual.id;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, categoryId, status: "active", stockType: "unlimited" },
    });
  }
  for (const p of virtualExtra) {
    const categoryId = p.type === "physical_goods" ? catSupplies.id : catVirtual.id;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, categoryId, status: "active", stockType: "unlimited" },
    });
  }

  /*
    2026-10 商业模式调整：纪念馆免费建立（/halls/new，需实名认证），
    type=memorial_hall 的付费建馆/续费商品**全部下架**（含名义上是"模板"、
    实际会触发付费建馆的 hall-template-elegant）。
    - 上面的 upsert 用 update:{}，重跑 seed 不会把已下架的刷回 active，
      但**全新环境**会 seed 出 active 商品 —— 所以下架必须显式写在这里。
    - 免费建馆通道：app/(public)/halls/new/actions.ts 的 createMemorialHall
      （实名门槛 + MZ/T 173 材料五字段 + pending 人工审核，与付费通道同口径）。
    - 免费版永久保存；装修升级/空间存储的到期续费语义见 lib/hall-decor.ts。
  */
  await prisma.product.updateMany({
    where: { type: "memorial_hall" },
    data: { status: "inactive" },
  });

  // 示例纪念馆（公开、已开通）
  const existHall = await prisma.memorialHall.findFirst({
    where: { ownerUserId: user.id, deceasedName: "示例 · 张老先生" },
  });
  if (!existHall) {
    await prisma.memorialHall.create({
      data: {
        ownerUserId: user.id,
        name: "张老先生纪念空间",
        deceasedName: "示例 · 张老先生",
        birthDate: new Date("1940-03-12"),
        deathDate: new Date("2023-11-08"),
        description: "一生勤勉，待人宽厚。此处收录其生平与亲友追思。",
        isPublic: true,
        status: "active",
        templateConfig: { theme: "warm", layout: "classic" },
      },
    });
  }

  // 示例直播（内测：本地/文件模拟流）
  await prisma.liveSession.upsert({
    where: { id: "seed-demo-live" },
    update: {},
    create: {
      id: "seed-demo-live",
      title: "清明 · 云端追思直播（示例）",
      description: "内测示例直播，演示列表与播放页。真实推流与字幕在公开阶段接入云直播。",
      status: "live",
      streamUrl:
        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      isPublic: true,
      startedAt: new Date(),
    },
  });

  console.log("✅ Seed 完成：superadmin@test.com(超管) / admin@test.com(管理员) / admin2@test.com(管理员) / user@test.com(用户)，4 篇新闻，6 件商品，1 个示例纪念馆，1 场示例直播");

  // —— 公益纪念堂演示数据（明确标注示例的虚构人物，仅用于展示 UI，非真实英烈） ——
  await prisma.publicMemorial.upsert({
    where: { slug: "example-shifu-yi" },
    update: { couplet: { left: "一生义渡济乡邻", right: "半世仁心照后人", horizontal: "德耀乡邦" } },
    create: {
      slug: "example-shifu-yi",
      name: "（示例）史福义",
      category: "GOOD_DEED",
      birthYear: 1958,
      deathYear: 2021,
      honorTitle: "三十年如一日义务摆渡的乡村好人",
      summary:
        "（本条目为演示数据，人物与事迹均为虚构）一位乡村渡工，三十年风雨无阻免费接送两岸乡亲，晚年仍将积蓄捐予村小。",
      story:
        "（示例数据）史福义自青年起守护村口渡口，不取分文。他常说「过河的乡亲就是自家人」。退休后仍每日巡堤、助学，被乡邻称为「义渡老人」。此处仅为演示公益纪念堂的展示形态，不代表任何真实人物。",
      sourceUrl: null,
      grade: "imperial",
      couplet: { left: "一生义渡济乡邻", right: "半世仁心照后人", horizontal: "德耀乡邦" },
      lightCount: 128,
      viewCount: 340,
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });

  await prisma.publicMemorial.upsert({
    where: { slug: "example-jianguo" },
    update: { couplet: { left: "临危挺身昭大义", right: "舍己救人铸忠魂", horizontal: "浩气长存" } },
    create: {
      slug: "example-jianguo",
      name: "（示例）李建国",
      category: "HEROIC",
      birthYear: 1975,
      deathYear: 2019,
      honorTitle: "危急关头挺身而出的见义勇为者",
      summary:
        "（本条目为演示数据，人物与事迹均为虚构）一次突发险情中，他为救陌生群众不幸牺牲，被追授见义勇为称号。",
      story:
        "（示例数据）李建国在他人生命受到威胁时毫不犹豫冲在最前，用行动诠释了平凡人的勇气。本条仅为演示公益纪念堂中「见义勇为」类别的呈现，不代表任何真实英烈或真实事件，相关认定以权威部门为准。",
      sourceUrl: null,
      grade: "imperial",
      couplet: { left: "临危挺身昭大义", right: "舍己救人铸忠魂", horizontal: "浩气长存" },
      lightCount: 256,
      viewCount: 612,
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });

  // 示例留言（已审核通过，用于演示留言板形态）
  const demoMemorial = await prisma.publicMemorial.findUnique({
    where: { slug: "example-jianguo" },
    select: { id: true },
  });
  if (demoMemorial) {
    const cnt = await prisma.publicMemorialMessage.count({
      where: { memorialId: demoMemorial.id, status: "APPROVED" },
    });
    if (cnt === 0) {
      await prisma.publicMemorialMessage.create({
        data: {
          memorialId: demoMemorial.id,
          nickname: "一位市民",
          content: "（示例留言）向平凡英雄致敬，愿这样的勇气被记住。",
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      });
    }

    // 示例花圈（平台免费提供，陈列 3 天）与免费祭品 —— 仅用于演示 UI 形态
    const wreathCnt = await prisma.publicMemorialWreath.count({
      where: { memorialId: demoMemorial.id },
    });
    if (wreathCnt === 0) {
      await prisma.publicMemorialWreath.create({
        data: {
          memorialId: demoMemorial.id,
          nickname: "社区居民",
          message: "（示例花圈）英雄走好，邻里永远记得您。",
          expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        },
      });
    }
    const offeringCnt = await prisma.publicMemorialOffering.count({
      where: { memorialId: demoMemorial.id },
    });
    if (offeringCnt === 0) {
      await prisma.publicMemorialOffering.createMany({
        data: [
          { memorialId: demoMemorial.id, type: "flower", label: "白菊" },
          { memorialId: demoMemorial.id, type: "incense", label: "清香" },
          { memorialId: demoMemorial.id, type: "candle", label: "长明灯" },
        ],
      });
      await prisma.publicMemorial.update({
        where: { id: demoMemorial.id },
        data: { offeringCount: { increment: 3 } },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
