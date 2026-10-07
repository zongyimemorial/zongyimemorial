// 宗祠 + 族谱图 示例数据
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const anyUser = admin ?? (await prisma.user.findFirst());
  if (!anyUser) throw new Error("无用户");

  // ---------------- 宗祠 ----------------
  const halls = [
    {
      surname: "李",
      hallName: "陇西李氏宗祠",
      name: "敦本堂",
      ancestorTitle: "陇西",
      ancestorName: "李广",
      origin: "甘肃陇西",
      description:
        "陇西李氏为天下李姓第一大望族。本祠始建于明嘉靖年间，清乾隆时重修，三进两院，前设仪门、中为享堂、后为寝堂。每年清明与冬至举行春秋二祭，族人齐聚，宣读祖训。",
      generationPoem:
        "克明俊德，以亲九族\n平章百姓，协和万邦\n彝伦攸叙，礼乐其昌\n诗书继世，忠厚传芳",
      viewCount: 1268,
      decor: {
        templateId: "clan-tpl-ancestral",
        slots: {
          wall: "clan-wall-brick",
          floor: "clan-floor-stone",
          ornament: "clan-orn-censer",
          frame: "clan-frame-wood",
          font: "clan-font-kai",
        },
        unlocked: [],
      },
    },
    {
      surname: "陈",
      hallName: "颍川陈氏宗祠",
      name: "德星堂",
      ancestorTitle: "颍川",
      ancestorName: "陈寔",
      origin: "河南颍川",
      description:
        "颍川陈氏以东汉太丘长陈寔为始祖，「德星聚」典故即出于此。堂号「德星堂」取陈寔父子与荀淑父子夜会、太史奏德星聚奎之典。宗祠正厅悬「德星堂」匾，两侧立朱柱，岁时祭享不绝。",
      generationPoem: "仁义礼智信，恭宽敏惠和\n诗书承世泽，忠厚振家声",
      viewCount: 942,
      decor: {
        templateId: "clan-tpl-vermilion",
        slots: {
          wall: "clan-wall-vermilion",
          floor: "clan-floor-plain",
          ornament: "clan-orn-lantern",
          frame: "clan-frame-wood",
          font: "clan-font-kai",
        },
        unlocked: [],
      },
    },
    {
      surname: "林",
      hallName: "西河林氏宗祠",
      name: "九牧堂",
      ancestorTitle: "西河",
      ancestorName: "林禄",
      origin: "福建莆田",
      description:
        "闽林始祖林禄于东晋入闽，居晋安。唐时林披生九子，皆官刺史，世称「九牧林家」。宗祠依山面海，门海屏障，祠内列九牧神位，春秋致祭。",
      generationPoem: "道体乾坤定，春秋翰墨香\n九牧传家远，忠孝永流芳",
      viewCount: 755,
      decor: {
        templateId: "clan-tpl-plain",
        slots: {
          wall: "clan-wall-white",
          floor: "clan-floor-plain",
          ornament: "clan-orn-censer",
          frame: "clan-frame-plain",
          font: "clan-font-song",
        },
        unlocked: [],
      },
    },
  ];

  for (const h of halls) {
    const exists = await prisma.clanHall.findFirst({
      where: { surname: h.surname, hallName: h.hallName },
    });
    if (exists) continue;
    await prisma.clanHall.create({
      data: {
        ownerUserId: anyUser.id,
        surname: h.surname,
        hallName: h.hallName,
        name: h.name,
        origin: h.origin,
        ancestorName: h.ancestorName,
        ancestorTitle: h.ancestorTitle,
        description: h.description,
        generationPoem: h.generationPoem,
        archive: { photos: [] },
        templateConfig: { decor: h.decor },
        status: "active",
        isPublic: true,
        viewCount: h.viewCount,
      },
    });
  }
  console.log(`宗祠示例：${halls.length} 座`);

  // ---------------- 族谱图（世系数据） ----------------
  // 使用数值世代（1,2,3…），家族世系按欧式体例组织
  const chartSeeds = [
    {
      surname: "李",
      hallName: "陇西堂",
      origin: "甘肃陇西",
      chartType: "ou",
      line: "克明俊德，以亲九族；平章百姓，协和万邦",
      migration: "陇西李氏出自嬴姓，世居陇西成纪。汉唐之际为关陇望族，唐室即出此系。",
      members: [
        { gen: 1, name: "李公讳广", relation: "始祖", note: "汉前将军，世居成纪，号飞将军" },
        { gen: 2, name: "李敢", relation: "长子", note: "袭关内侯，从霍去病击匈奴" },
        { gen: 2, name: "李椒", relation: "次子", note: "代郡太守" },
        { gen: 2, name: "李氏", relation: "女", note: "适河东王氏" },
        { gen: 3, name: "李禹", relation: "长子", note: "嗣子，袭爵，传八世" },
        { gen: 3, name: "李陵", relation: "次子", note: "骑都尉，事详见《汉书》" },
        { gen: 4, name: "李承宗", relation: "长子", note: "居陇西，为本支大宗" },
        { gen: 4, name: "李承业", relation: "次子", note: "止" },
        { gen: 5, name: "李文渊", relation: "长子", note: "待考" },
        { gen: 5, name: "李文清", relation: "次子", note: "迁居河东" },
      ],
    },
    {
      surname: "陈",
      hallName: "颍川堂",
      origin: "河南颍川",
      chartType: "su",
      line: "仁义礼智信，恭宽敏惠和；诗书承世泽，忠厚振家声",
      migration: "颍川陈氏自东汉陈寔开基，晋室南渡后裔入闽，唐宋之际分衍闽台。",
      members: [
        { gen: 1, name: "陈寔", relation: "始祖", note: "东汉太丘长，「德星聚」典故所出" },
        { gen: 2, name: "陈纪", relation: "长子", note: "官至大鸿胪" },
        { gen: 2, name: "陈谌", relation: "次子", note: "与父兄并称「三君」" },
        { gen: 3, name: "陈群", relation: "长子", note: "魏司空，创九品中正制" },
        { gen: 3, name: "陈忠", relation: "次子", note: "止" },
        { gen: 4, name: "陈泰", relation: "长子", note: "魏征西将军" },
        { gen: 5, name: "陈准", relation: "长子", note: "晋太尉，本支大宗" },
      ],
    },
    {
      surname: "林",
      hallName: "西河堂",
      origin: "福建莆田",
      chartType: "pagoda",
      line: "道体乾坤定，春秋翰墨香；九牧传家远，忠孝永流芳",
      migration: "东晋林禄入闽居晋安，为闽林始祖；唐九牧林科第连绵，后裔分衍闽台粤琼及南洋。",
      members: [
        { gen: 1, name: "林禄", relation: "入闽始祖", note: "东晋琅琊人，官晋安太守" },
        { gen: 2, name: "林景", relation: "长子", note: "封南平侯" },
        { gen: 2, name: "林暹", relation: "次子", note: "居晋安" },
        { gen: 3, name: "林绥", relation: "长子", note: "传闽林大宗" },
        { gen: 4, name: "林格", relation: "长子", note: "待考" },
        { gen: 5, name: "林靖之", relation: "长子", note: "宋初迁莆田" },
        { gen: 5, name: "林玄之", relation: "次子", note: "止" },
      ],
    },
    {
      surname: "黄",
      hallName: "江夏堂",
      origin: "湖北江夏",
      chartType: "dieji",
      line: "文章报国，诗礼传家；江夏源流远，紫云世泽长",
      migration: "黄氏出于嬴姓，以江夏为郡望。南宋末年避乱南迁珠玑巷，分衍珠江三角洲，清代部分族人侨居南洋。",
      members: [
        { gen: 1, name: "黄香", relation: "始祖", note: "东汉尚书令，以孝闻名，扇枕温衾" },
        { gen: 2, name: "黄琼", relation: "长子", note: "东汉太尉" },
        { gen: 2, name: "黄琬", relation: "次子", note: "东汉太尉，与父并居三公" },
        { gen: 3, name: "黄阁", relation: "长子", note: "传江夏大宗" },
        { gen: 4, name: "黄峭山", relation: "长子", note: "遣二十一子散居各地开基" },
        { gen: 5, name: "黄化", relation: "长子", note: "迁邵武，为闽粤黄氏共同祖先" },
      ],
    },
  ];

  for (const seed of chartSeeds) {
    const existing = await prisma.genealogy.findFirst({
      where: { surname: seed.surname, hallName: seed.hallName },
    });
    const data = {
      chartType: seed.chartType,
      chartConfig: {
        title: `${seed.surname}氏族谱世系图`,
        hallName: seed.hallName,
        origin: seed.origin,
        showNotes: true,
        showGenLabels: true,
      },
      membersJson: seed.members,
    };

    if (existing) {
      await prisma.genealogy.update({ where: { id: existing.id }, data });
    } else {
      await prisma.genealogy.create({
        data: {
          ...data,
          surname: seed.surname,
          hallName: seed.hallName,
          origin: seed.origin,
          lineage: seed.line,
          migration: seed.migration,
          ownerId: anyUser.id,
          status: "approved",
          isPublic: true,
          viewCount: 120 + seed.members.length * 7,
        },
      });
    }
  }
  console.log(`族谱图示例：${chartSeeds.length} 部`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
