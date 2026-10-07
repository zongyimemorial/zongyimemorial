/**
 * 族谱图：数据模型与版式算法
 *
 * 版式依据中国现存最流行的四种传统族谱图（家谱世系图）体例设计：
 *
 *  1. 欧式（横行体 / 欧阳修式）：世代分格，由右向左横行，五世一表（即"五服图"）。
 *     每世代一行，同辈兄弟自右向左排列；表旁附各人字号、仕宦、生卒与生平。
 *  2. 苏式（垂珠体 / 吊线图，苏洵创）：世代直行下垂，全用竖线串联；
 *     同辈兄弟由长及幼、自右向左排列，形如垂珠。
 *  3. 宝塔式（垂丝图）：上下排列，世代自上而下层层展开，
 *     竖线恒定落在横线中间，形如宝塔。
 *  4. 牒记式：不用连线，纯以文字表述人物关系，
 *     逐人记述"某公，某地某氏子/女，适某地某姓，子几"。
 *
 * 另有三种收费的精美版式：描金欧式、绢帛苏式、丹青宝塔（在基础体例上叠加材质与装饰）。
 *
 * 族谱书写规范（本模块与渲染器共同遵守）：
 *  - 直系用实线，旁系用虚线
 *  - 女子注「适某地某姓」
 *  - 过继注「嗣子」、存疑注「待考」
 *  - 无后注「止」、未成年而亡注「殇」
 */

import type { DecorTier } from "@/lib/hall-decor";

// ---------------------------------------------------------------------------
// 版式
// ---------------------------------------------------------------------------
export type ChartType = "ou" | "su" | "pagoda" | "dieji" | "miaojin" | "juanbo" | "danqing";

export const FREE_CHART_TYPES: ChartType[] = ["ou", "su", "pagoda", "dieji"];
export const PRO_CHART_TYPES: ChartType[] = ["miaojin", "juanbo", "danqing"];
export const ALL_CHART_TYPES: ChartType[] = [...FREE_CHART_TYPES, ...PRO_CHART_TYPES];

export const CHART_META: Record<
  ChartType,
  { name: string; alias: string; desc: string; tier: DecorTier; base: ChartType; points?: number }
> = {
  ou: {
    name: "欧式",
    alias: "横行体 · 欧阳修式",
    desc: "世代分格、由右向左横行，五世一表（五服图）。最通行，适合人多的大族。",
    tier: "free",
    base: "ou",
  },
  su: {
    name: "苏式",
    alias: "垂珠体 · 吊线图",
    desc: "世代直行下垂，全用竖线串联，兄弟自右向左排列，形如垂珠。",
    tier: "free",
    base: "su",
  },
  pagoda: {
    name: "宝塔式",
    alias: "垂丝图",
    desc: "先后自上而下排列，竖线恒落横线中间，层层收拢如宝塔。",
    tier: "free",
    base: "pagoda",
  },
  dieji: {
    name: "牒记式",
    alias: "文字记述体",
    desc: "不用连线，纯以文字逐人记述世系关系，最接近古谱原貌。",
    tier: "free",
    base: "dieji",
  },
  miaojin: {
    name: "描金欧式",
    alias: "精美版式",
    desc: "欧式体例 + 烫金描边与绢面底纹，庄重华贵，适合刊印成册。",
    tier: "premium",
    base: "ou",
  },
  juanbo: {
    name: "绢帛苏式",
    alias: "精美版式",
    desc: "苏式体例 + 古典绢帛材质与朱栏，雅致考究。",
    tier: "premium",
    base: "su",
  },
  danqing: {
    name: "丹青宝塔",
    alias: "精美版式",
    desc: "宝塔式体例 + 工笔云纹与丹青设色，最宜展示与馈赠。",
    tier: "premium",
    base: "pagoda",
  },
};

/** 版式配色主题 */
export const CHART_THEMES: Record<
  ChartType,
  {
    /** 纸面底色 */
    paper: string;
    /** 主文字色 */
    ink: string;
    /** 次要文字色 */
    muted: string;
    /** 线条色 */
    line: string;
    /** 强调色（世代标签、边框） */
    accent: string;
    /** 装饰边框样式 */
    border: string;
    /** 字体 */
    fontFamily: string;
    /** 姓名标签底色 */
    chipBg: string;
  }
> = {
  ou: {
    paper: "#fffdf8",
    ink: "#2b2620",
    muted: "#8a8073",
    line: "#b8ae9e",
    accent: "#9a3b2c",
    border: "1px solid #e2d9c8",
    fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif',
    chipBg: "rgba(154,59,44,0.06)",
  },
  su: {
    paper: "#fdfcf9",
    ink: "#26282b",
    muted: "#7f858a",
    line: "#a9b0b5",
    accent: "#2f5d6b",
    border: "1px solid #dde3e5",
    fontFamily: '"Kaiti SC","KaiTi","STKaiti",serif',
    chipBg: "rgba(47,93,107,0.06)",
  },
  pagoda: {
    paper: "#fffdf9",
    ink: "#2b2620",
    muted: "#8a8073",
    line: "#c0ac86",
    accent: "#8a6234",
    border: "1px solid #e8dcc2",
    fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif',
    chipBg: "rgba(138,98,52,0.07)",
  },
  dieji: {
    paper: "#fdfcf8",
    ink: "#2f2b24",
    muted: "#8a8073",
    line: "#cfc6b5",
    accent: "#5d5344",
    border: "1px solid #e5ddcd",
    fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif',
    chipBg: "transparent",
  },
  miaojin: {
    paper: "linear-gradient(160deg,#fffaf0 0%,#f8ecd2 55%,#f2e0b8 100%)",
    ink: "#3a2c10",
    muted: "#8c7647",
    line: "#c9a24a",
    accent: "#b8860b",
    border: "2px solid #d4af37",
    fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif',
    chipBg: "rgba(212,175,55,0.14)",
  },
  juanbo: {
    paper: "linear-gradient(150deg,#fbf7ef 0%,#f3ecdc 50%,#eae0c8 100%)",
    ink: "#3b3226",
    muted: "#8d8067",
    line: "#b99a6b",
    accent: "#9c6b3f",
    border: "3px double #b99a6b",
    fontFamily: '"Kaiti SC","KaiTi","STKaiti",serif',
    chipBg: "rgba(185,154,107,0.13)",
  },
  danqing: {
    paper: "linear-gradient(170deg,#f4f8f6 0%,#e8f0ea 45%,#dfe9e2 100%)",
    ink: "#22322a",
    muted: "#6f8177",
    line: "#94ab9c",
    accent: "#3f6b52",
    border: "2px solid #9db8a6",
    fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif',
    chipBg: "rgba(63,107,82,0.10)",
  },
};

// ---------------------------------------------------------------------------
// 数据模型
// ---------------------------------------------------------------------------
/** 原始世系成员（来自 Genealogy.membersJson 或设计器录入） */
export type MemberRow = {
  gen: number;
  name: string;
  relation?: string;
  note?: string;
};

/** 整理后的树节点 */
export type ChartNode = {
  id: string;
  gen: number;
  name: string;
  relation?: string;
  note?: string;
  /** 是否直系（决定实线/虚线） */
 直系?: boolean;
  children: ChartNode[];
};

export type ChartConfig = {
  type: ChartType;
  title?: string;
  /** 堂号 */
  hallName?: string;
  /** 郡望 / 始迁地 */
  origin?: string;
  /** 是否显示生平注 */
  showNotes?: boolean;
  /** 是否显示世代标签 */
  showGenLabels?: boolean;
};

/** 世代的中文序号（一世、二世…），超过则用阿拉伯数字 */
export function genLabel(gen: number): string {
  const cn = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (gen >= 1 && gen <= 10) return `第${cn[gen]}世`;
  if (gen > 10 && gen < 20) return `第${cn[10]}${cn[gen - 10]}世`;
  return `第${gen}世`;
}

/** 世代简称，用于表头（"一世"） */
export function genShort(gen: number): string {
  const cn = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (gen >= 1 && gen <= 10) return `${cn[gen]}世`;
  return `${gen}世`;
}

/**
 * 校验世系数据。
 * 规则：至少一条；世代为正整数；姓名非空；世代必须从 1 开始且不跳号。
 */
export function validateChart(members: MemberRow[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!members.length) {
    errors.push("世系数据为空，请先录入成员");
    return { ok: false, errors };
  }
  const gens = new Set<number>();
  members.forEach((m, i) => {
    const line = i + 1;
    if (!Number.isInteger(m.gen) || m.gen < 1) errors.push(`第 ${line} 条的世代必须是正整数`);
    if (!m.name?.trim()) errors.push(`第 ${line} 条缺少姓名`);
    if (Number.isInteger(m.gen) && m.gen >= 1) gens.add(m.gen);
  });
  const sorted = [...gens].sort((a, b) => a - b);
  if (sorted.length && sorted[0] !== 1) errors.push("世代必须从第 1 世（始祖）开始");
  sorted.forEach((g, i) => {
    if (i > 0 && g !== sorted[i - 1] + 1) {
      errors.push(`第 ${sorted[i - 1]} 世与第 ${g} 世之间缺少世代，请补齐`);
    }
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 6) };
}

/** 按世代分组的成员 */
export function groupByGen(members: MemberRow[]): Map<number, MemberRow[]> {
  const map = new Map<number, MemberRow[]>();
  const sorted = [...members].sort((a, b) => a.gen - b.gen);
  for (const m of sorted) {
    const list = map.get(m.gen) ?? [];
    list.push(m);
    map.set(m.gen, list);
  }
  return map;
}

/**
 * 从扁平的成员列表构建树。
 *
 * 归属规则（不依赖显式父指针，兼容各家谱的简式录入）：
 *  - 第 1 世全部为根节点。
 *  - 后续世代按「同世代顺序」尽可能地挂到上一世节点下：
 *    若上一世只有 1 人，则全部挂到该人下；
 *    否则按关系字段（"长子/次子/三子/四子…"）解析出的序数挂到对应父节点；
 *    无法解析时平均分配。
 */
export function buildTree(members: MemberRow[]): ChartNode[] {
  const byGen = groupByGen(members);
  const gens = [...byGen.keys()].sort((a, b) => a - b);
  if (!gens.length) return [];

  const toNode = (m: MemberRow, idx: number): ChartNode => ({
    id: `g${m.gen}-${idx}-${m.name}`,
    gen: m.gen,
    name: m.name,
    relation: m.relation,
    note: m.note,
    children: [],
  });

  let prev: ChartNode[] = (byGen.get(gens[0]) ?? []).map(toNode);

  for (let gi = 1; gi < gens.length; gi++) {
    const g = gens[gi];
    const rows = byGen.get(g) ?? [];
    const nodes = rows.map(toNode);

    if (prev.length === 0) {
      prev = nodes;
      continue;
    }

    // 解析关系中的序数："长子"=0、"次子"=1、"三子"=2 ……
    const ordinalOf = (relation?: string): number | null => {
      if (!relation) return null;
      const map: Record<string, number> = {
        长: 0, 嫡: 0, 孟: 0, 伯: 0,
        次: 1, 仲: 1,
        三: 2, 叔: 2,
        四: 3, 季: 3,
        五: 4, 六: 5, 七: 6, 八: 7, 九: 8, 十: 9,
      };
      for (const key of Object.keys(map)) {
        if (relation.includes(key)) return map[key];
      }
      return null;
    };

    const parentsResolved = nodes.map((n) => ordinalOf(n.relation));
    const canAssign = parentsResolved.every(
      (o) => o !== null && o < prev.length,
    );

    if (canAssign) {
      nodes.forEach((n, i) => prev[parentsResolved[i]!]!.children.push(n));
    } else {
      // 平均分配
      nodes.forEach((n, i) => {
        const pi = prev.length === 1 ? 0 : Math.floor((i * prev.length) / nodes.length);
        prev[Math.min(pi, prev.length - 1)]!.children.push(n);
      });
    }

    prev = nodes;
  }

  return (byGen.get(gens[0]) ?? []).map(toNode);
}

/** 是否解锁某版式 */
export function isChartUnlocked(
  type: ChartType,
  opts: { isPremium: boolean; unlocked: string[] },
): boolean {
  const meta = CHART_META[type];
  if (!meta) return false;
  if (meta.tier === "free") return true;
  if (opts.isPremium) return true;
  return opts.unlocked.includes(type);
}

/** 该版式实际使用的基座体例（精美版式回落到基础体例） */
export function baseChartType(type: ChartType): ChartType {
  return CHART_META[type]?.base ?? "ou";
}

/** 归一化版式：未解锁则回落到 ou */
export function normalizeChartType(
  type: unknown,
  opts: { isPremium: boolean; unlocked: string[] },
): ChartType {
  const t = String(type || "") as ChartType;
  if (!ALL_CHART_TYPES.includes(t)) return "ou";
  return isChartUnlocked(t, opts) ? t : "ou";
}

/** 从 Genealogy 记录构造渲染配置 */
export function chartConfigFromGenealogy(
  g: {
    surname: string;
    hallName?: string | null;
    origin?: string | null;
    chartType?: string | null;
    chartConfig?: unknown;
  },
  opts: { isPremium: boolean; unlocked: string[] },
): ChartConfig {
  const cfg = (g.chartConfig ?? {}) as Partial<ChartConfig>;
  return {
    type: normalizeChartType(g.chartType ?? cfg.type, opts),
    title: cfg.title ?? `${g.surname}氏族谱世系图`,
    hallName: cfg.hallName ?? g.hallName ?? undefined,
    origin: cfg.origin ?? g.origin ?? undefined,
    showNotes: cfg.showNotes ?? true,
    showGenLabels: cfg.showGenLabels ?? true,
  };
}

/** 解析 membersJson 为 MemberRow[] */
export function parseMembers(raw: unknown): MemberRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return {
        gen: Number(o.gen) || 0,
        name: String(o.name ?? "").trim(),
        relation: o.relation ? String(o.relation).trim() : undefined,
        note: o.note ? String(o.note).trim() : undefined,
      };
    })
    .filter((m) => m.gen > 0 && m.name);
}

/** 统计信息（用于列表缩略与设计器提示） */
export function chartStats(members: MemberRow[]) {
  const gens = new Set(members.map((m) => m.gen));
  return {
    total: members.length,
    generations: gens.size,
    maxGen: gens.size ? Math.max(...gens) : 0,
  };
}

/** 示例世系：用于空数据时的引导预览 */
export const SAMPLE_MEMBERS: MemberRow[] = [
  { gen: 1, name: "李公讳广", relation: "始祖", note: "唐陇西郡公，世居成纪" },
  { gen: 2, name: "李敢", relation: "长子", note: "袭关内侯" },
  { gen: 2, name: "李椒", relation: "次子", note: "代郡太守" },
  { gen: 2, name: "李氏", relation: "女", note: "适河东王氏" },
  { gen: 3, name: "李禹", relation: "长子", note: "嗣子，袭爵" },
  { gen: 3, name: "李陵", relation: "次子", note: "骑都尉" },
  { gen: 4, name: "李承宗", relation: "长子", note: "居陇西，传八世" },
  { gen: 4, name: "李承业", relation: "次子", note: "止" },
  { gen: 5, name: "李文渊", relation: "长子", note: "待考" },
];

/** 族谱书写规范提示（展示在渲染器页脚 / 设计器帮助） */
export const CHART_NOTATION = [
  { mark: "直系实线 / 旁系虚线", desc: "以线型区分直系与旁系血脉" },
  { mark: "适某地某姓", desc: "女子出嫁记为「适」，后接夫家地与姓" },
  { mark: "嗣子", desc: "过继他人为子者，注明嗣子身份" },
  { mark: "待考", desc: "世系存疑、尚待考证者" },
  { mark: "止", desc: "无后者注「止」，表示此支到此为止" },
  { mark: "殇", desc: "未成年而亡者注「殇」" },
];
