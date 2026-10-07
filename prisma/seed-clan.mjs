// 板块三示例数据：族谱 / 宗族活动 / 宗亲社区帖子
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const anyUser = admin ?? (await prisma.user.findFirst());
  if (!anyUser) throw new Error("无用户");

  // 族谱示例（审核通过，公开可检索）
  const genealogies = [
    {
      surname: "陈", hallName: "颍川堂", origin: "河南颍川 → 福建泉州",
      lineage: "仁义礼智信，恭宽敏惠和；诗书承世泽，忠厚振家声",
      migration: "西晋永嘉之乱，陈氏自中原南渡入闽，居泉州晋江流域，繁衍至今六十余世。明清两代族人渡海赴台及南洋谋生者众。",
      membersJson: [
        { gen: "一世", name: "陈邕", relation: "入闽始祖", note: "唐中宗朝官至太子洗马" },
        { gen: "十世", name: "陈洪进", relation: "本支", note: "五代末泉州节度使" },
        { gen: "廿一世", name: "陈嘉庚", relation: "同宗", note: "侨领，倾资兴学" },
      ],
      viewCount: 328,
    },
    {
      surname: "林", hallName: "西河堂", origin: "福建莆田",
      lineage: "道体乾坤定，春秋翰墨香；九牧传家远，忠孝永流芳",
      migration: "东晋时林禄入闽，家于晋安，为闽林始祖。唐宋之际莆田九牧林科第连绵，后裔分衍闽台粤琼及南洋各地。",
      membersJson: [
        { gen: "一世", name: "林禄", relation: "入闽始祖", note: "东晋琅琊人" },
        { gen: "九世", name: "林披", relation: "本支", note: "唐九牧林之父，生九子皆刺史" },
        { gen: "十五世", name: "林则徐", relation: "同宗", note: "近代民族英雄" },
      ],
      viewCount: 456,
    },
    {
      surname: "黄", hallName: "江夏堂", origin: "湖北江夏 → 广东南雄珠玑巷",
      lineage: "文章报国，诗礼传家；江夏源流远，紫云世泽长",
      migration: "南宋末年避乱自珠玑巷南迁珠江三角洲，分支番禺、南海、顺德诸邑，清代部分族人侨居南洋槟城、新加坡。",
      membersJson: [
        { gen: "一世", name: "黄香", relation: "江夏始祖", note: "东汉孝子，扇枕温衾" },
        { gen: "十二世", name: "黄峭山", relation: "本支", note: "遣二十一子散居各地开基" },
      ],
      viewCount: 289,
    },
  ];
  for (const g of genealogies) {
    const exists = await prisma.genealogy.findFirst({
      where: { surname: g.surname, hallName: g.hallName },
    });
    if (!exists) {
      await prisma.genealogy.create({
        data: { ...g, ownerId: anyUser.id, status: "approved", isPublic: true },
      });
    }
  }
  console.log("族谱示例：3 部");

  // 宗族活动示例
  const actCount = await prisma.clanActivity.count();
  if (actCount === 0) {
    const now = new Date();
    await prisma.clanActivity.createMany({
      data: [
        {
          title: "乙巳年清明宗祠联合祭祖大典",
          kind: "祭祖大典", location: "泉州晋江宗祠文化广场",
          onlineLink: "https://zongyitang.lhr.rocks/live",
          description: "清明期间联合祭祖，现场设公祭仪式、诵读祭文、敬献花篮环节；不能到场者可通过平台云直播线上观礼。",
          startAt: new Date(now.getTime() + 15 * 86400000), capacity: 200, signupCount: 2,
        },
        {
          title: "闽南姓氏族谱数字化修谱研讨会（线上）",
          kind: "修谱研讨", location: "线上会议", onlineLink: "https://zongyitang.lhr.rocks/clan",
          description: "邀请谱牒学者与民间修谱人交流数字化修谱经验：老谱扫描、世系录入、字辈考订。",
          startAt: new Date(now.getTime() + 7 * 86400000), capacity: 100, signupCount: 1,
        },
        {
          title: "壬寅年冬至宗亲联谊会",
          kind: "宗亲联谊", location: "厦门宗亲会馆",
          description: "冬至团聚，叙乡情、话族谊，已圆满举办。",
          startAt: new Date(now.getTime() - 30 * 86400000), capacity: 150, signupCount: 96, status: "finished",
        },
      ],
    });
    console.log("宗族活动：3 场");
  }

  // 社区帖子示例
  const postCount = await prisma.clanPost.count();
  if (postCount === 0) {
    const post = await prisma.clanPost.create({
      data: {
        userId: anyUser.id, surname: "林", topic: "寻根问祖",
        title: "先祖自莆田迁粤西，求九牧林世系对接线索",
        body: "家中老谱记载先祖于清乾隆年间自兴化府莆田县迁往粤西高州府，字辈为'道体乾坤定'，望同宗宗亲提供九牧林世系资料，以便对接。",
        status: "approved", replyCount: 1,
      },
    });
    await prisma.clanPostReply.create({
      data: {
        postId: post.id, userId: anyUser.id,
        body: "我支谱牒中恰有乾隆年间迁高州一支的记载，可私信交换老谱扫描件核对。",
        status: "approved",
      },
    });
    await prisma.clanPost.create({
      data: {
        userId: anyUser.id, surname: "陈", topic: "字辈讨论",
        title: "颍川堂新拟二十世字辈，征求各支系意见",
        body: "拟续字辈：承先启后昆，弘毅致远方。请各支系宗亲在家族议事中协商确认后统一录入族谱数据库。",
        status: "approved",
      },
    });
    console.log("社区帖子：2 帖 1 回");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
