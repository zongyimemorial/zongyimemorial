// 内容充实种子：由大模型按规划方案生成的新闻稿 + 商品详情，写入数据库
// 运行：node prisma/seed-content.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const A = "/assets"; // public 静态前缀

/*
  ⚠️ 扩展名必须是 **.jpg** —— public/assets 下的这些封面早已从生成的 SVG
  换成真实图片（.jpg），但这里的引用没跟着更新，导致页面请求
  `/assets/cover-policy.svg` 等 **6 个资源 404**（控制台报错、图片空白）。

  这类"文件名改了、引用没改"的错很隐蔽：不报构建错、页面照常渲染，
  只在浏览器控制台留下一串 404。`verify-product-pricing.mjs` §8 的
  「无控制台错误」断言把它抓出来了。
*/
const COVER = {
  policy: `${A}/cover-policy.jpg`,
  culture: `${A}/cover-culture.jpg`,
  story: `${A}/cover-story.jpg`,
  announcement: `${A}/cover-announcement.jpg`,
};
const PROD = {
  memorial_hall: `${A}/prod-hall.jpg`,
  cloud_worship: `${A}/prod-cloud.jpg`,
  virtual_flower: `${A}/prod-flower.jpg`,
  tribute_item: `${A}/prod-flower.jpg`,
  physical_goods: `${A}/prod-supplies.jpg`,
  memorial_service: `${A}/prod-service.jpg`,
};

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@test.com" } });
  if (!admin) throw new Error("请先运行 npm run seed 创建演示账号");

  // 栏目
  const cat = {};
  for (const slug of ["announcement", "culture", "policy", "story"]) {
    cat[slug] = await prisma.category.findUnique({ where: { slug } });
  }

  // ===== 新闻：为已有 3 篇补封面，再新增 14 篇 =====
  const existingCovers = {
    welcome: COVER.announcement,
    "memorial-culture": COVER.culture,
    "policy-icp": COVER.policy,
  };
  for (const [slug, coverImage] of Object.entries(existingCovers)) {
    await prisma.article.updateMany({ where: { slug }, data: { coverImage } });
  }

  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * 86400000);

  const articles = [
    {
      slug: "digital-memorial-boundary",
      categoryId: cat.policy.id,
      title: "数字纪念与殡葬服务的边界：平台如何合规定位",
      summary: "文化传播与数字纪念技术服务，是平台合规的立足点；明确边界，才能走得更稳更远。",
      body: `## 为什么要厘清边界

殡葬祭祀类网站最容易踩的坑，是把"文化传播/数字纪念"与"线下殡葬服务经营"混为一谈。前者属于一般互联网信息服务，后者涉及民政、卫健等多部门的前置审批与经营资质。

## 我们的定位

宗忆堂自上线之初即明确：**本平台是文化传播与数字纪念技术服务方，不涉及线下殡葬服务经营**。我们提供的是：

- 新闻资讯与生命文化科普
- 数字纪念馆、云祭扫、虚拟献花等数字纪念服务
- 纪念文案、追思视频等文化内容创作

## 合规的三条底线

1. 公开内容先过机器预筛，再经人工终审，规避"封建迷信"等违规表述。
2. 虚拟商品统一表述为"数字纪念服务/云祭扫/在线追思"，不使用"改运、超度、风水改命"等话术。
3. 纪念馆与虚拟服务需用户实名后使用，证件信息加密存储，最小必要收集。

厘清边界不是限制，而是让这份"思念的生意"能在阳光下长久运行。`,
      seoTitle: "数字纪念与殡葬服务的边界：平台如何合规定位",
      seoKeywords: "数字纪念,合规,殡葬服务边界",
      seoDescription: "厘清文化传播与殡葬服务经营的边界，是殡葬祭祀类平台合规运营的前提。",
      publishedAt: daysAgo(2),
      viewCount: 423,
    },
    {
      slug: "privacy-realname",
      categoryId: cat.policy.id,
      title: "实名与隐私：个人信息保护法下的纪念平台实践",
      summary: "实名是为了守护真实的缅怀，隐私保护则是我们对每一位用户的基本承诺。",
      body: `## 为什么数字纪念需要实名

数字纪念馆承载的是真实的人与真实的情感。实行实名，既是为了防止冒用他人身份建立纪念馆，也是平台履行内容责任、配合应急处置的基础。

## 我们如何保护你的信息

- **最小必要**：仅收集建立纪念馆与开通服务所必需的姓名与证件信息。
- **加密存储**：证件信息采用字段级加密，存放于受控的私有存储，不出现在业务日志中。
- **明确授权**：收集前以明示方式告知用途，你可随时查询授权范围。
- **留痕可审计**：访问与核验操作均留存日志，便于追溯。

## 你可以怎么做

在提交实名信息前，请确认你是在为家人或经授权的逝者建立纪念空间；如对个人信息的处理有疑问，可通过客服邮箱提出查询或更正请求。

隐私不是口号，而是每一次点击背后的具体设计。`,
      seoTitle: "实名与隐私：个人信息保护法下的纪念平台实践",
      seoKeywords: "实名,隐私保护,个人信息保护法",
      seoDescription: "数字纪念平台如何在实名与隐私保护之间取得平衡。",
      publishedAt: daysAgo(5),
      viewCount: 356,
    },
    {
      slug: "green-mourning-policy",
      categoryId: cat.policy.id,
      title: "绿色低碳祭扫的政策导向与趋势",
      summary: "从实地焚香到云端点灯，绿色祭扫正在成为政策鼓励的方向。",
      body: `## 政策在鼓励什么

近年来，多地出台文明祭扫、绿色祭扫的倡导，鼓励以鲜花替代纸钱、以线上追思替代集中焚烧，既缓解环境压力，也降低火灾隐患。

## 数字纪念的减碳价值

云祭扫、虚拟献花、在线点灯等服务，无需物流、无需焚烧，天然具备低碳属性：

- 免去纸质讣告、纸质花圈的印刷与运输
- 减少实地祭扫的集中出行与碳排放
- 让远在他乡的亲友也能随时表达敬意

## 我们的态度

我们尊重各地民俗与禁燃政策，提供**合规、环保、可远程**的纪念方式作为补充，而非替代实地祭扫。形式会变，慎终追远的心意不变。`,
      seoTitle: "绿色低碳祭扫的政策导向与趋势",
      seoKeywords: "绿色祭扫,低碳,文明祭扫",
      seoDescription: "梳理绿色低碳祭扫的政策导向，以及数字纪念的减碳价值。",
      publishedAt: daysAgo(9),
      viewCount: 512,
    },
    {
      slug: "epitaph-to-cloud",
      categoryId: cat.culture.id,
      title: "从墓志铭到宗忆堂馆：纪念载体的千年演变",
      summary: "石碑会风化，云端的不灭。纪念载体的演变，折射着人们对“记得”的不变渴望。",
      body: `## 石碑时代：刻在石头上的记忆

墓志铭、家谱、牌位，是农业社会最主要的纪念载体。它们庄重、持久，却也受限于地理——不在现场，便难以凭吊。

## 影像时代：照片与录像

相机让逝者的音容得以保留，但照片册与录像带终会褪色、损坏，传播范围也有限。

## 云端时代：可随时抵达的思念

数字纪念馆把生平、照片、亲友留言整合在一个永久可访问的链接里。扫码即达，异地可祭，还能随着家族记忆不断生长。

> 载体在变，唯一不变的是"不愿被遗忘"的心意。

宗忆堂馆不是要取代石碑，而是给这份心意一个不被时间与距离阻隔的归处。`,
      seoTitle: "从墓志铭到宗忆堂馆：纪念载体的千年演变",
      seoKeywords: "宗忆堂馆,纪念载体,墓志铭",
      seoDescription: "从墓志铭到宗忆堂馆，纪念载体如何随技术演进。",
      publishedAt: daysAgo(3),
      viewCount: 689,
    },
    {
      slug: "family-tree-digital",
      categoryId: cat.culture.id,
      title: "家谱与数字谱系：让家族记忆可传承",
      summary: "修家谱是中华文化的传统。数字谱系，让族谱在新一代手中继续生长。",
      body: `## 修谱的传统

"三世不修谱，即为不孝。"传统家谱记录世系、生平与家训，是家族记忆的载体。但手写族谱笨重、易散佚，年轻一代也难有耐心翻阅。

## 数字谱系的优势

- **可协作**：分散各地的族人都能补充资料
- **可检索**：按姓名、辈分快速定位
- **可留存**：云端备份，不怕水火虫蛀
- **可分享**：生成链接，远亲也能查看

## 我们怎么做

家族纪念馆支持多位逝者生平与家族谱系并列呈现，配合扫码云碑，让祖辈的故事在清明、忌日与日常都能被后代轻轻翻开。

记忆不该只在纸页里泛黄，也可以在指尖被一次次温习。`,
      seoTitle: "家谱与数字谱系：让家族记忆可传承",
      seoKeywords: "家谱,数字谱系,家族记忆",
      seoDescription: "数字谱系如何让传统家谱在新一代中继续生长。",
      publishedAt: daysAgo(7),
      viewCount: 421,
    },
    {
      slug: "life-education-online",
      categoryId: cat.culture.id,
      title: "互联网时代的生命教育：从谈论死亡开始",
      summary: "回避死亡，反而让人更怕失去。数字纪念，是温和的生命教育入口。",
      body: `## 我们为什么回避死亡

在中文语境里，"死"常被视为禁忌。但回避并不会减少失去的痛苦，反而让我们在至亲离去时措手不及。

## 生命教育的意义

生命教育不是恐吓，而是帮人理解：生命有期限，正因如此，当下的相处才值得珍惜。它包含：

- 如何看待衰老与离别
- 如何表达爱与歉意
- 如何把逝者的精神继续活下去

## 数字纪念的角色

为逝者整理生平、写下追思，本身就是一次温柔的生命教育。当孩子为祖辈建立纪念馆，他们学到的不是恐惧，而是"记得"的能力。

谈死，是为了更好地生。`,
      seoTitle: "互联网时代的生命教育：从谈论死亡开始",
      seoKeywords: "生命教育,死亡教育,数字纪念",
      seoDescription: "数字纪念如何成为温和的生命教育入口。",
      publishedAt: daysAgo(12),
      viewCount: 738,
    },
    {
      slug: "story-village-teacher",
      categoryId: cat.story.id,
      title: "一位乡村教师的线上追思会",
      summary: "他教过两代人读书。离世后，学生们在云端为他办了一场迟到的班会。",
      body: `## 他留在山里的四十年

李老师在大山里教了四十年书，送走的学生有的成了医生，有的回了乡。去年冬天，他安静地离开了。

## 一场云端的班会

除夕前，当年的一届学生发起线上追思会：有人读他批改过的作文本，有人放出泛黄的全家福，还有人念起他最常说的那句"字要写端正"。

> "老师没走远，他只是去给我们看更远的路了。"

## 为什么在云端

学生们天南地北，难聚一堂。数字纪念馆把照片、视频与留言收拢在一处，追思会直播让每个人都能到场。

这不是终点。纪念馆会一直开着，愿后来者记得，山里有这样一位先生。`,
      seoTitle: "一位乡村教师的线上追思会",
      seoKeywords: "追思故事,线上追思会,乡村教师",
      seoDescription: "一位乡村教师离世后，学生如何在云端为他办一场追思会。",
      publishedAt: daysAgo(4),
      viewCount: 1203,
    },
    {
      slug: "story-overseas-worship",
      categoryId: cat.story.id,
      title: "远方游子的云端家祭",
      summary: "回不去的清明，点得亮的灯。一位海外务工者的家常思念。",
      body: `## 三年没回家了

阿强在海外务工，三年没赶上清明。母亲年事已高，父亲走后，家里的祭扫全靠兄弟。

## 点亮那盏灯

今年，他在手机上为父亲点亮一盏电子长明灯，又献上一束虚拟鲜花。隔着屏幕，他给父亲写了一句话：

> "爸，灯我点上了，您和妈都保重。"

## 思念没有时差

云祭扫不替代回家的路，却是回不去时的那根线。它让远方的灯，和家里的香，在同一个清明里亮着。

慎终追远，不在远近，在心意。`,
      seoTitle: "远方游子的云端家祭",
      seoKeywords: "云端家祭,海外游子,云祭扫",
      seoDescription: "一位海外务工者如何用云祭扫寄托清明思念。",
      publishedAt: daysAgo(8),
      viewCount: 967,
    },
    {
      slug: "story-veteran-qr",
      categoryId: cat.story.id,
      title: "老兵纪念：用一枚二维码让军功永存",
      summary: "墓碑上的二维码，扫码是一座纪念馆。让英雄的故事不被风雨抹去。",
      body: `## 风雨里的名字

某烈士陵园里，不少墓碑字迹已被风雨磨平。家属希望，后人不只看到名字，还能读到他们做过什么。

## 一枚二维码铭牌

我们为几位老兵制作了扫码云碑：二维码张贴于墓碑或相框，扫码即达专属宗忆堂馆，收录生平、军功照与亲友留言。

## 永存的不只是名字

> "爷爷，您的故事，我们替您留着。"

数字纪念不是冰冷的二维码，而是一座不会被风雨吹散的丰碑。它让军功与笑容，在每一次扫码里重新被看见。`,
      seoTitle: "老兵纪念：用一枚二维码让军功永存",
      seoKeywords: "老兵纪念,扫码云碑,烈士陵园",
      seoDescription: "用扫码云碑让老兵军功与故事永久留存。",
      publishedAt: daysAgo(14),
      viewCount: 1542,
    },
    {
      slug: "points-system-launch",
      categoryId: cat.announcement.id,
      title: "积分体系上线：消费与纪念都能积攒心意",
      summary: "下单数字纪念服务可得积分，积分可兑换纪念馆续费、点灯、讣告等心仪服务。",
      body: `## 积分来了

为感谢早期用户，宗忆堂积分体系正式上线。你在平台上的每一份心意，都能被记下来。

## 怎么获得

- 注册即赠 2000 积分体验金
- 购买数字纪念服务，按实付金额 1:1 累积积分
- 参与内测反馈，有机会获得额外积分

## 怎么用

积分可兑换：纪念馆续费、电子长明灯年卡、电子讣告、虚拟挽联等。具体兑换比例见 [积分兑换页](/points)。

> 积分是心意的刻度，不是营销的手段。

积分长期有效（内测期内），欢迎在控制台查看你的余额。`,
      seoTitle: "积分体系上线：消费与纪念都能积攒心意",
      seoKeywords: "积分,积分兑换,内测",
      seoDescription: "宗忆堂积分体系上线，消费与纪念都能累积积分并兑换服务。",
      publishedAt: daysAgo(1),
      viewCount: 845,
    },
    {
      slug: "hall-template-renew",
      categoryId: cat.announcement.id,
      title: "数字纪念馆模板焕新：更克制，也更温暖",
      summary: "新版纪念馆模板优化了排版与配色，让缅怀更专注、阅读更舒适。",
      body: `## 这次改了什么

应内测用户反馈，我们 refreshed 数字纪念馆的展示模板：

- 重新设计的封面与生平排版，重点更突出
- 更克制的配色，减少干扰，让内容本身被看见
- 移动端阅读体验优化，扫码即达也能顺畅浏览

## 老馆怎么办

已开通的纪念馆将自动套用新版式，你无需任何操作；如想保留旧版，可在控制台提交反馈。

## 还想要什么

模板仍在迭代。欢迎在内测群里告诉我们，你希望纪念馆还能怎样更像一个"家"。`,
      seoTitle: "数字纪念馆模板焕新：更克制，也更温暖",
      seoKeywords: "数字纪念馆,模板,更新",
      seoDescription: "数字纪念馆展示模板焕新，阅读体验更优。",
      publishedAt: daysAgo(6),
      viewCount: 502,
    },
    {
      slug: "qingming-cloud-campaign",
      categoryId: cat.announcement.id,
      title: "清明云祭扫专题活动预告",
      summary: "清明将至，我们准备了一场关于“记得”的专题：免费建馆、点灯祈福、追思会直播。",
      body: `## 清明专题 · 记得

清明是思念最集中的时节。今年，我们准备了云祭扫专题：

- **免费建馆体验**：内测期内创建数字纪念馆免开通费
- **点灯祈福**：清明期间线上点灯，寄语飘向云端
- **追思会直播**：为家族或单位举办一场线上追思会

## 如何参与

登录后进入"数字纪念馆"，按引导创建即可；如需举办线上追思会，可在商城选择对应服务。

## 一句提醒

云祭扫是实地祭扫的补充。若条件允许，也请记得给家里打个电话、敬一杯清茶。

清明，愿你我在云端与人间，都不孤单。`,
      seoTitle: "清明云祭扫专题活动预告",
      seoKeywords: "清明,云祭扫,专题活动",
      seoDescription: "清明云祭扫专题活动预告：免费建馆、点灯祈福、追思会直播。",
      publishedAt: daysAgo(11),
      viewCount: 1330,
    },
    {
      slug: "content-review-principle",
      categoryId: cat.policy.id,
      title: "公开内容先过审：我们的内容安全原则",
      summary: "机器预筛 + 人工终审，是平台对公众与对逝者共同的责任。",
      body: `## 为什么必须审核

祭祀、追思内容情感浓重，也最易被不当利用。作为面向公众的平台，我们有责任确保每一条公开内容：

- 不触碰"封建迷信"等合规红线
- 不冒用他人身份，不侵害隐私
- 不传播不实信息与不当商业引导

## 三级机制

1. **机器预筛**：发布前置语义检测，命中风险标签即进入人工队列
2. **人工终审**：编辑复核后才会公开
3. **举报与下架**：用户可一键举报，可疑内容即时下架并留痕

## AI 只做辅助

无论是新闻草稿还是追思文案，AI 仅出初稿与预筛，**绝不自动发布**。公网内容必须经人确认。

审核不是束缚表达，而是守护这份庄重。`,
      seoTitle: "公开内容先过审：我们的内容安全原则",
      seoKeywords: "内容审核,内容安全,合规",
      seoDescription: "殡葬祭祀平台的内容审核原则：机筛+人审+举报下架。",
      publishedAt: daysAgo(16),
      viewCount: 388,
    },
  ];

  let n = 0;
  for (const a of articles) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        slug: a.slug,
        categoryId: a.categoryId,
        title: a.title,
        summary: a.summary,
        body: a.body,
        coverImage: COVER[
          Object.keys(cat).find((k) => cat[k].id === a.categoryId) || "culture"
        ],
        seoTitle: a.seoTitle,
        seoKeywords: a.seoKeywords,
        seoDescription: a.seoDescription,
        authorId: admin.id,
        status: "published",
        isAiGenerated: true,
        viewCount: a.viewCount,
        publishedAt: a.publishedAt,
      },
    });
    n++;
  }
  console.log(`✅ 新闻：新增 ${n} 篇，并为 3 篇原有文章补封面`);

  // ===== 商品：丰富详情 + 封面 + 画廊 =====
  const productRich = {
    "digital-memorial-hall": "数字纪念馆（一年）是为逝者建立的专属线上纪念空间。开通后，你可以上传生平简介、老照片与影像，写下纪念馆寄语，邀请亲友远程追思、留言与点灯。\n\n纪念馆采用克制的排版与暖色调，突出内容与思念本身；支持公开或仅亲友可见两种权限，扫码即可在手机上流畅浏览。一年有效期内可随时补充资料、管理留言。\n\n适用场景：为至亲建立永久可访问的纪念归处，尤其适合异地家属与后代缅怀。",
    "cloud-worship": "云祭扫是由礼仪人员协助完成的在线祭扫服务。你下单后，我们会在约定时间为逝者代客献花、点灯，并诵读你提供的追思词，全程以照片与短视频回传，让你身在远方也能参与这场仪式。\n\n服务过程庄重肃穆，遵循文明祭扫规范，不使用明火、不焚烧，环保而得体。\n\n适用场景：清明、忌日或无法亲临现场的远程祭扫。",
    "virtual-flower": "虚拟献花是在数字纪念馆献上一束永不凋谢的线上鲜花，表达思念与敬意。一键敬献，即时显示在纪念馆的献花墙上，并可附上一句话寄语。\n\n花束样式素雅庄重，多款可选；献花记录会留在纪念馆，供亲友共同追忆。\n\n适用场景：日常缅怀、忌日表达心意，或作为线上追思会的一环。",
    "online-lamp": "在线点灯为你点亮一盏长明灯，愿思念长明。灯亮起后常驻纪念馆，可追溯点亮时间与寄语，也可设为公开让亲友共亮。\n\n灯火采用温暖的暖光意象，沉静不喧哗，契合缅怀氛围。\n\n适用场景：清明点灯、忌日守灯，或仅仅是想“让灯一直亮着”。",
    "incense-offering": "祭祀香烛礼盒为环保配方香烛与祭品组合，适用于清明、忌日等实地祭扫场景。礼盒顺丰包邮，内含使用说明与文明祭扫提示。\n\n我们提倡环保、减量使用，并尊重各地禁燃政策；在禁燃区域请优先选择云祭扫等线上方式。\n\n适用场景：实地祭扫、墓前供奉。",
    "flower-basket": "仿真花圈为高仿真花艺制品，庄重肃穆，支持定制挽联文字，全国配送。花圈以耐用材质制作，适合殡仪馆、告别仪式与墓前摆放。\n\n下单时可备注挽联内容，我们将核对后制作；如当地有环保替代倡导，也可改选虚拟挽联。\n\n适用场景：告别仪式、墓前供奉、单位集体悼念。",
    "family-memorial-hall": "家族纪念馆（三年）是为整个家族建立的共享数字纪念空间，支持多位逝者生平并列呈现，并梳理家族谱系，让后代一眼看清来处。\n\n三年有效期内，族人可协作补充资料、轮流维护；配合扫码云碑，祖辈故事能在清明与日常被一次次温习。\n\n适用场景：望族修谱数字化、跨地域家族共同缅怀。",
    "memorial-renew": "纪念馆续费（一年）为已开通的数字纪念馆延续访问权限，让思念的归处不被时间关闭。续费后所有资料、留言与献花记录完整保留，无需重新建立。\n\n我们会在到期前提醒，避免纪念馆意外下线。\n\n适用场景：纪念馆即将到期，希望继续保留。",
    "bio-writing": "生平传记代写由专业文案根据亲友口述、旧照与生平素材，撰写一篇庄重得体的生平传记，约 2000 字。我们会先与你沟通结构，再交付初稿并由你确认。\n\n传记可用于数字纪念馆、讣告与纪念视频，文字克制有情，回避夸大与迷信表述。\n\n适用场景：希望为至亲留下一份得体的生命记录。",
    "online-memorial-meeting": "线上追思会（直播）为亲友举办一场云端追思：提供直播房间、主持串词与留言墙，远端亲友皆可进入，实时追思与互动。\n\n我们协助流程设计与彩排，可嵌入照片墙与背景音乐；回放将保存在纪念馆供后续观看。\n\n适用场景：忌日追思、单位集体悼念、异地家族聚会缅怀。",
    "memorial-video": "追思纪念视频制作将照片、影像与音乐剪辑成一支约 3 分钟的追思视频，节奏舒缓、配乐庄重，可供纪念馆与亲友分享。\n\n你提供素材，我们完成粗剪与精修；成片可嵌入纪念馆封面或追思会回放。\n\n适用场景：忌日放映、告别仪式背景、朋友圈缅怀分享。",
    "e-obituary": "电子讣告发布为你在线生成一份可分享的缅怀页，免去纸质讣告的奔波。页面含逝者生平、告别仪式信息与留言区，生成链接即可发给亲友。\n\n内容经你确认后发布，支持设置公开或凭密码访问。\n\n适用场景：异地通知、环保讣告、作为纸质讣告的补充。",
    "qr-tombstone": "扫码云碑（二维码铭牌）是一枚可张贴于墓碑或相框的二维码铭牌，扫码即达专属宗忆堂馆，让思念随时可达。铭牌防水耐候，图文清晰。\n\n它不改变实地祭扫，只是给石碑加了一扇“云端的门”，让后人轻轻一扫，便翻开祖辈的故事。\n\n适用场景：墓碑/骨灰龛配套、家族相框、单位纪念墙。",
    "lamp-year": "电子长明灯（年卡）点亮一盏全年不灭的电子长明灯，系统每日自动续灯，愿你不在时思念也长明。灯常驻纪念馆，可查看累计点亮天数。\n\n年卡比单次点灯更省心，适合长期缅怀。\n\n【关于价格】同类纪念平台的年费长明灯多在 ¥168–¥268，永久点亮普遍 ¥598 起；本平台年卡 9.8 元，单日成本不足 3 分钱。我们不做限时倒计时，也不设“孝心榜”——点亮与否、亮多久，完全由你决定。\n\n适用场景：长期守灯、异地日常缅怀。",
    "virtual-wreath": "虚拟挽联是在数字纪念馆敬献的一副线上挽联，表达庄重哀思。你可填写上、下联与落款，即时展示于纪念馆。\n\n作为实体花圈的线上替代，它环保、即时、可永久留存。\n\n适用场景：线上追思会、忌日表达、替代纸质挽联。",
  };

  let pn = 0;
  const all = await prisma.product.findMany();
  for (const p of all) {
    const desc = productRich[p.slug];
    if (!desc) continue;
    const cover = PROD[p.type] || `${A}/prod-service.svg`;
    await prisma.product.update({
      where: { slug: p.slug },
      data: { description: desc, coverImage: cover, gallery: [cover] },
    });
    pn++;
  }
  console.log(`✅ 商品：丰富 ${pn} 件详情，并补充封面与画廊`);

  // 示例纪念馆 / 直播封面（同样必须 .jpg，见上方 COVER 注释）
  await prisma.memorialHall.updateMany({
    where: { deceasedName: "示例 · 张老先生" },
    data: { coverImage: `${A}/hall-cover.jpg` },
  });
  await prisma.liveSession.updateMany({
    where: { id: "seed-demo-live" },
    data: { coverImage: `${A}/live-cover.jpg` },
  });
  console.log("✅ 示例纪念馆 / 直播封面已设置");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
