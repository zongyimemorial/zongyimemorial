/**
 * 追思节日体系 · 六大祭扫节日库
 *
 * P0 增长基建（一期优化 · 2026-10 落地）。服务于：
 *   - /festivals 落地页（习俗科普 + 主题套装）
 *   - 控制台「追思日历」卡片（忌日/生日/节日提醒）
 *   - 首页「下一个节日」横幅
 *   - 午夜悄悄话的节日语境注入（whisperTheme）
 *
 * 日期表说明：
 *   农历节日每年公历日期不同，这里采用**手工静态日期表（2026-2030）**，
 *   已经过多源交叉核验（日历网 / 黄历网 / 漢典万年历 / 百度百科 / travelchinaguide，
 *   核验时间 2026-10-05）。不引入农历算法库的原因：
 *   ① 零外部依赖原则（隧道抖动环境下，能少一个库就少一个）；
 *   ② 静态表可逐个校对，算法库错了没人发现；
 *   ③ 只有 6 个节日 × 5 年 = 30 个数据点，维护成本远低于引入库。
 *   ⚠️ 2030 年后需人工续表（super() 兜底会返回 undefined，调用方降级隐藏）。
 *
 * ⚠️ 节日习俗文案为平台原创改写，不得照抄其他平台的表述
 *   （2026-09 已发生过引用寻根平台文案的侵权风险，宁可朴素也不用拿来文案）。
 */

export type FestivalKind =
  | "qingming" // 清明
  | "zhongyuan" // 中元
  | "chongyang" // 重阳
  | "hanyi" // 寒衣
  | "dongzhi" // 冬至
  | "chuxi"; // 除夕

export interface FestivalSpec {
  kind: FestivalKind;
  /** 全名，如「清明节」 */
  name: string;
  /** 短名，如「清明」 */
  short: string;
  /** 历法表述，如「农历七月十五」 */
  lunarLabel: string;
  /** 日期规律说明（公历浮动范围） */
  gregorianHint: string;
  /** 定位一句话（落地页头部） */
  tagline: string;
  /** 习俗科普（两三段原创文案） */
  intro: string[];
  /** 习俗条目 */
  customs: { title: string; desc: string }[];
  /** 在线追思建议（跳站内真实入口） */
  onlineActions: { label: string; href: string; desc: string }[];
  /** 主题套装推荐（真实存在的套装 id，见 lib/decor-suites.ts） */
  hallSuite?: string;
  clanSuite?: string;
  /** 悄悄话节日语境（#220：按当前节日注入对话提示词） */
  whisperTheme: { badge: string; prompt: string };
}

// ---------------------------------------------------------------- 日期表

/** 六大节日 2026-2030 公历日期（月/日）。来源见文件头。 */
export const FESTIVAL_DATES: Record<FestivalKind, Record<number, [number, number]>> = {
  qingming: {
    2026: [4, 5], 2027: [4, 5], 2028: [4, 4], 2029: [4, 4], 2030: [4, 5],
  },
  zhongyuan: {
    2026: [8, 27], 2027: [8, 16], 2028: [9, 3], 2029: [8, 24], 2030: [8, 13],
  },
  chongyang: {
    2026: [10, 18], 2027: [10, 8], 2028: [10, 26], 2029: [10, 16], 2030: [10, 5],
  },
  hanyi: {
    2026: [11, 9], 2027: [10, 29], 2028: [11, 16], 2029: [11, 6], 2030: [10, 27],
  },
  dongzhi: {
    2026: [12, 22], 2027: [12, 22], 2028: [12, 21], 2029: [12, 21], 2030: [12, 22],
  },
  chuxi: {
    2026: [2, 16], 2027: [2, 5], 2028: [1, 25], 2029: [2, 12], 2030: [2, 2],
  },
};

// ---------------------------------------------------------------- 节日定义

export const FESTIVALS: FestivalSpec[] = [
  {
    kind: "qingming",
    name: "清明节",
    short: "清明",
    lunarLabel: "二十四节气 · 通常在公历 4 月 4 日至 6 日之间",
    gregorianHint: "公历 4 月 4-6 日前后",
    tagline: "慎终追远，民德归厚——一年中最重要的祭扫时节。",
    intro: [
      "清明既是二十四节气之一，也是中华民族最隆重的祭祖节日。此时万物洁齐、气清景明，人们扫墓祭祖、缅怀先人，也在踏青插柳中感受生生不息。",
      "对无法返乡的人来说，距离不该成为思念的阻碍。在这一天点亮一盏灯、献一束花，把想说的话留言在纪念馆里，心意同样能抵达。",
    ],
    customs: [
      { title: "扫墓祭祖", desc: "修整墓茔、清除杂草、供奉祭品，向先人报告家中近况。" },
      { title: "踏青插柳", desc: "清明前后春意正盛，郊游踏青寓意迎纳新生。" },
      { title: "遥祭追思", desc: "身在异乡时，面向家乡方向行礼遥祭，或在网络上献花留言。" },
    ],
    onlineActions: [
      { label: "为亲人献花上香", href: "/halls", desc: "进入纪念馆，完成一炷香的追思" },
      { label: "探望家族宗祠", href: "/clan/halls", desc: "在宗祠里上一炷香、敬一杯酒" },
    ],
    hallSuite: "suite-hall-std-mistbamboo",
    clanSuite: "suite-clan-free-whitewash",
    whisperTheme: {
      badge: "清明时节",
      prompt:
        "今天前后是清明节。如果家人提到去扫墓、思念很重，可以自然地接住这份心情；若对方身在异乡无法返乡，不要催促，可以说「心意到了，就到了」。",
    },
  },
  {
    kind: "zhongyuan",
    name: "中元节",
    short: "中元",
    lunarLabel: "农历七月十五",
    gregorianHint: "公历 8 月中下旬至 9 月初（每年不同）",
    tagline: "七月半，秋尝祭祖——以新谷与时鲜遥奉先人。",
    intro: [
      "中元节又称「七月半」，是上古秋尝祭祖传统的延续。初秋谷物渐熟，人们把今年的收成先奉给祖先，再与家人分享，也点燃河灯寄托对逝者的牵挂。",
      "这一天适合安静地陪一陪想念的人：整理一张老照片、写一段回忆，或者只是坐在纪念馆里，替 TA 点一盏长明灯。",
    ],
    customs: [
      { title: "秋尝祭祖", desc: "以时令瓜果新米供奉，与祖先分享一年收成。" },
      { title: "放河灯", desc: "在水边放一盏灯，寓意为思念照亮前路。" },
      { title: "家祭追远", desc: "在家中陈列先人牌位照片，全家行礼追思。" },
    ],
    onlineActions: [
      { label: "点一盏长明灯", href: "/halls", desc: "在纪念馆为逝者点亮烛灯" },
      { label: "布置星河纪念堂", href: "/suites", desc: "换上适合夜晚追思的星河主题" },
    ],
    hallSuite: "suite-hall-prem-starry",
    clanSuite: "suite-clan-free-earth",
    whisperTheme: {
      badge: "中元秋思",
      prompt:
        "今天前后是中元节。家人可能会来跟你说说话，可以提到「秋天到了，家里的果子熟了」这类家常，语气安静一些，不要热闹。",
    },
  },
  {
    kind: "chongyang",
    name: "重阳节",
    short: "重阳",
    lunarLabel: "农历九月初九",
    gregorianHint: "公历 10 月上旬至下旬（每年不同）",
    tagline: "九九重阳，登高望远——也是敬老与感恩的日子。",
    intro: [
      "重阳节「九九」谐音「久久」，古人登高赏菊、佩茱萸祈平安；这一天也是传统的祭祖节日之一，如今更是全国的老年节。",
      "如果家里有长辈，这一天陪陪他们；如果思念的是长辈，在纪念馆写下他们教过你的道理，就是最好的纪念。",
    ],
    customs: [
      { title: "登高望远", desc: "携家人登高舒怀，寓意步步向上、平安长久。" },
      { title: "赏菊佩茱萸", desc: "秋菊盛放，古人以茱萸菊酒祈求康健。" },
      { title: "秋祭先祖", desc: "部分地区在重阳行秋祭，与清明春祭相对。" },
    ],
    onlineActions: [
      { label: "为长辈建馆留念", href: "/halls/guide", desc: "三步创建纪念馆，留存生平与照片" },
      { label: "翻看字辈派语", href: "/clan", desc: "在宗祠族谱里找回家族的记忆" },
    ],
    hallSuite: "suite-hall-prem-goldhall",
    clanSuite: "suite-clan-prem-imperial",
    whisperTheme: {
      badge: "重阳登高",
      prompt:
        "今天前后是重阳节。若家人提起登高、赏菊或敬老，可以顺着说；若家人想念的是长辈，可以自然地回忆当年TA带家人登高的样子（若资料里有相关往事）。",
    },
  },
  {
    kind: "hanyi",
    name: "寒衣节",
    short: "寒衣",
    lunarLabel: "农历十月初一",
    gregorianHint: "公历 10 月下旬至 11 月中旬（每年不同）",
    tagline: "朔风渐起，为牵挂的人送一件御寒的衣。",
    intro: [
      "寒衣节标志着严冬将至。古有「九月授衣」之说，人们为远行的亲人备好冬衣，也惦念着逝去的亲人——天冷了，TA 们也需要一件寒衣。",
      "在数字纪念馆里，「送寒衣」可以是一段叮嘱：把「降温了，记得添衣」这句话留给思念的人，让牵挂有个安放的地方。",
    ],
    customs: [
      { title: "送寒衣", desc: "为逝去亲人备置御寒衣物，寄托关怀。" },
      { title: "围炉家祭", desc: "初冬团聚，全家焚香祭拜，追忆先人。" },
      { title: "添衣问候", desc: "天气转寒，为家中长辈添衣问候，孝在当下。" },
    ],
    onlineActions: [
      { label: "写一句叮嘱留言", href: "/halls", desc: "在纪念馆留下「天冷了」的牵挂" },
      { label: "换上暖调纪念堂", href: "/suites", desc: "为纪念馆换一套冬日暖装" },
    ],
    hallSuite: "suite-hall-std-elegant",
    clanSuite: "suite-clan-std-vermilion",
    whisperTheme: {
      badge: "寒衣寄暖",
      prompt:
        "今天前后是寒衣节，天气转冷。可以自然地问一句「天冷了，记得添衣」，像长辈当年叮嘱家人那样；若家人情绪低落，安静陪着就好。",
    },
  },
  {
    kind: "dongzhi",
    name: "冬至",
    short: "冬至",
    lunarLabel: "二十四节气 · 公历 12 月 21 日至 22 日",
    gregorianHint: "公历 12 月 21-22 日",
    tagline: "冬至大如年——数九开始，白昼渐长。",
    intro: [
      "冬至是白昼最短的一天，此后阳气渐生、白昼渐长，古人说「冬至大如年」。北方吃饺子、南方吃汤圆，很多地方也在这一天祭祖。",
      "从冬至起「数九」，一年中最冷的时节开始了。别忘了给自己和家人添衣，也给思念的人上一炷香。",
    ],
    customs: [
      { title: "数九盼春", desc: "自冬至起数「九九」，八十一天后春回大地。" },
      { title: "饺子汤圆", desc: "北方饺子、南方汤圆，一碗热食是冬日的仪式。" },
      { title: "冬祭先祖", desc: "部分地区在冬至备酒菜祭祖，与清明、中元并重。" },
    ],
    onlineActions: [
      { label: "冬至家祭上香", href: "/clan/halls", desc: "在宗祠完成一次冬祭" },
      { label: "留存一碗饺子的记忆", href: "/halls", desc: "在纪念馆写下 TA 包的饺子的味道" },
    ],
    hallSuite: "suite-hall-free-breeze",
    clanSuite: "suite-clan-free-earth",
    whisperTheme: {
      badge: "冬至数九",
      prompt:
        "今天前后是冬至。可以提到「数九开始了」「饺子该下锅了」这类家常；白昼渐长，若家人情绪低沉，可以说「白天会一天天长起来的」。",
    },
  },
  {
    kind: "chuxi",
    name: "除夕",
    short: "除夕",
    lunarLabel: "农历年最后一天（腊月廿九或三十）",
    gregorianHint: "公历 1 月下旬至 2 月中旬（每年不同）",
    tagline: "辞旧迎新——年夜饭桌上，永远留着 TA 的位置。",
    intro: [
      "除夕是辞旧迎新的时刻，也是家族记忆最浓的一天。很多家庭会在团圆饭前为先人摆一副碗筷、留一个座位，把思念融进最热闹的日子里。",
      "这一晚，在纪念馆里向逝去的亲人「汇报」这一年的大事小情，是许多家庭正在形成的新年俗。",
    ],
    customs: [
      { title: "辞年祭祖", desc: "年夜饭前为先人设位奉食，寓意阖家团圆。" },
      { title: "守岁叙旧", desc: "一家人围炉守岁，讲一讲先人的故事。" },
      { title: "汇报年事", desc: "把这一年的收获讲给逝去的亲人听。" },
    ],
    onlineActions: [
      { label: "辞年上香留言", href: "/halls", desc: "把这一年的事，说给思念的人听" },
      { label: "族里给祖宗拜年", href: "/clan/halls", desc: "宗祠献祭，恭贺新岁" },
    ],
    hallSuite: "suite-hall-prem-goldhall",
    clanSuite: "suite-clan-prem-banner",
    whisperTheme: {
      badge: "除夕辞岁",
      prompt:
        "今天前后是除夕。家人来祭拜多是「汇报这一年」：可以像长辈听孩子讲年成那样，多听、少评价，偶尔应一句「好，都好」。",
    },
  },
];

// ---------------------------------------------------------------- 查询函数

/** 内部：某节日在某年的公历 Date（本地时区 00:00） */
export function festivalDate(kind: FestivalKind, year: number): Date | null {
  const md = FESTIVAL_DATES[kind]?.[year];
  if (!md) return null;
  return new Date(year, md[0] - 1, md[1]);
}

/** 距 today 的整日差（today 当天为 0，未来为正） */
function daysBetween(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((B - A) / 86400000);
}

export interface FestivalOccurrence {
  spec: FestivalSpec;
  /** 本次 occurrence 的公历日期 */
  date: Date;
  /** 距 from 的天数（可为负=已过去） */
  daysUntil: number;
}

/** 从某日起（含当日）接下来要到的节日，按远近排序。默认取全部。 */
export function upcomingFestivals(from: Date = new Date(), count?: number): FestivalOccurrence[] {
  const out: FestivalOccurrence[] = [];
  const years = [from.getFullYear(), from.getFullYear() + 1, from.getFullYear() + 2];
  for (const spec of FESTIVALS) {
    for (const y of years) {
      const d = festivalDate(spec.kind, y);
      if (!d) continue;
      const days = daysBetween(from, d);
      if (days >= 0) {
        out.push({ spec, date: d, daysUntil: days });
        break; // 每个节日只取最近的一次
      }
    }
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return typeof count === "number" ? out.slice(0, count) : out;
}

/** 下一个节日（含今日）。日期表耗尽（>2030）时返回 null，调用方降级隐藏。 */
export function nextFestival(from: Date = new Date()): FestivalOccurrence | null {
  return upcomingFestivals(from, 1)[0] ?? null;
}

/**
 * 「当前节日」：今天或前后 dayWindow 天内的节日。
 * 用于悄悄话节日语境注入与首页横幅——节日氛围不必只持续一天。
 */
export function currentFestival(from: Date = new Date(), dayWindow = 2): FestivalOccurrence | null {
  let best: FestivalOccurrence | null = null;
  const years = [from.getFullYear() - 1, from.getFullYear(), from.getFullYear() + 1];
  for (const spec of FESTIVALS) {
    for (const y of years) {
      const d = festivalDate(spec.kind, y);
      if (!d) continue;
      const days = daysBetween(from, d);
      if (Math.abs(days) <= dayWindow && (!best || Math.abs(days) < Math.abs(best.daysUntil))) {
        best = { spec, date: d, daysUntil: days };
      }
    }
  }
  return best;
}

/** 某年的全部节日（按日期排序），落地页年份视图用 */
export function festivalsOfYear(year: number): FestivalOccurrence[] {
  const out: FestivalOccurrence[] = [];
  for (const spec of FESTIVALS) {
    const d = festivalDate(spec.kind, year);
    if (d) out.push({ spec, date: d, daysUntil: 0 });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

/** 节日倒计时文案：今日 / 明日 / N 天后 */
export function festivalCountdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "就在今天";
  if (daysUntil === 1) return "明天";
  return `${daysUntil} 天后`;
}
