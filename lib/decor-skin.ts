/**
 * 全页联动换肤：把「一份装修方案」翻译成「一组 CSS 变量」。
 *
 * ============================================================================
 * 为什么需要这一层
 * ============================================================================
 *
 * 现在的装修只改了 **3D 场景内部** 的观感。公页上除了那块画布以外，
 * 标题、卡片、分隔线、按钮、页脚**全都还是平台默认的素白样式** ——
 * 用户花 ¥59 买了「缂丝金龙」，结果整页看上去跟没装修时差不多，
 * 落差只在那一块 340px 高的预览里。用户的原话是：
 * 「保证修装后的纪念馆、宗祠美观豪华，且与没有装修过的有明显区别，
 *   否则用户就没有装修的欲望与动机」。
 *
 * 所以换肤要覆盖整页，而不只是画布。
 *
 * ============================================================================
 * 为什么用 CSS 变量，而不是 React Context
 * ============================================================================
 *
 * ① 公页是 **Server Component**。Context 要求 Provider 是客户端组件，
 *    等于把整个馆页拖进客户端 bundle —— 首屏与隧道环境都受不了。
 * ② CSS 变量**天然级联**：在根节点写一次，子孙任意深度的卡片都能读到，
 *    不需要逐层透传 props（装修方案要穿过 5~6 层组件才到卡片）。
 * ③ 变量是**内联 style 字符串**，不依赖 `window` —— 服务端能算出同样的值，
 *    因此**没有水合 mismatch 风险**（这是 AGENTS.md 反复强调的一条）。
 * ④ **不改任何 DOM 结构**。只加 `style`，既有契约（卡片标题的 class、
 *    `div.p-3`、`overflow-hidden`）一个字都不动，23 套既有断言零风险。
 *
 * ============================================================================
 * 三段合并顺序（**顺序本身就是设计**）
 * ============================================================================
 *
 *   DEFAULT_SKIN （素白基准，= "没装修"的样子）
 *        ↓ 覆盖
 *   槽位素材的 skin （wall → floor → ornament → frame → font）
 *        ↓ 覆盖
 *   模板自己的 skin （整套模板最后拍板）
 *
 * 为什么模板在最上层：用户挑的是"整套气质"，单件素材只是零件。
 * 若反过来（素材盖模板），用户点了「鎏金宝殿」之后又单独换了张壁纸，
 * 整页气质会被那张壁纸带跑偏 —— 而模板才是他真正花钱买的东西。
 *
 * 为什么要保留 `DEFAULT_SKIN` 这个基准（而不是"没有就是透明"）：
 * 它就是**对比视图的左边那一屏**。用户要能一眼看出"装修前 / 装修后"，
 * 就必须有一个明确的、非空的"装修前"。"
 */

import type { CSSProperties } from "react";
import type { DecorSlot, HallDecor } from "@/lib/hall-decor";

/**
 * 换肤 token。
 *
 * 刻意只留 12 个 —— 够覆盖"整页气质"（主色/描金/圆角/边框/分隔/底纹/
 * 按钮/标题字重字距/阴影/明暗），又少到能一眼看全。再加字段前先问：
 * 「这条能靠已有的某条推导出来吗？」能推导的就不加，否则必然出现
 * "改了 primary 但 secondary 没跟着改"的漂移。
 */
export type SkinTokens = {
  /** 主色：卡片描边、标题装饰、强调文字 */
  primary: string;
  /** 次色：次级文字、浅分隔 */
  secondary: string;
  /**
   * 描金。**这是"豪华度"最灵敏的那个探针** ——
   * 素白档为 `transparent`，豪华档为真金色。
   * 断言直接读它：未装修页 `--skin-gilt` 必须是 transparent。
   */
  gilt: string;
  /** 圆角（CSS 长度） */
  radius: string;
  /** 边框样式（solid / double / ridge / none） */
  borderStyle: string;
  /** 分隔线图案（CSS background-image）；null = 用素色细线 */
  dividerPattern: string | null;
  /** 卡片底纹（CSS background-image）；null = 无纹理 */
  cardTexture: string | null;
  /** 按钮前景 / 背景 */
  buttonFg: string;
  buttonBg: string;
  /** 标题字重 */
  titleWeight: number;
  /** 标题字距 */
  titleTracking: string;
  /** 阴影强度 0~1（0 = 几乎无阴影，1 = 厚重投影） */
  shadow: number;
  /**
   * 是否深色底。
   *
   * 为什么要把它做成 token，而不是继续用 `isClanDarkDecor()` 那类
   * 硬编码 id 列表：列表式判定的致命伤是**新增暗色壁纸时忘了加进去**，
   * 于是深底上仍是深字 —— 整段正文看不见，而且几乎没人会去回归测这个。
   * 改成"素材自己声明 dark"，新增素材时顺手声明，漏了也只是这一件不对。
   * （灰度期先 `skin.dark || onDarkWall` 并存，确认无回归后再撤旧判定。）
   */
  dark: boolean;
};

/**
 * 素白基准 = **"没有装修"的样子**。
 *
 * 这几个值不是随便挑的，它们必须与平台当前的默认视觉一致 ——
 * 因为"装修前"这一屏就是拿它渲染的，若它与真实默认态不符，
 * 对比视图会变成"虚假落差"（把默认态画丑一点来衬托付费档），
 * 那是欺骗用户，也骗不过复核。
 */
export const DEFAULT_SKIN: SkinTokens = {
  primary: "#a8744f",
  secondary: "#9a938a",
  gilt: "transparent",
  radius: "10px",
  borderStyle: "solid",
  dividerPattern: null,
  cardTexture: null,
  buttonFg: "#ffffff",
  buttonBg: "#a8744f",
  titleWeight: 600,
  titleTracking: "0.02em",
  shadow: 0.15,
  dark: false,
};

/**
 * 换肤增量的推断（两层：**规则给出 mood，mood 给出 token**）。
 *
 * ## 为什么不做"给上百件素材各写一份 skin"
 *
 * 素材有 125 件 + 43 套模板。逐件手写意味着：
 *   ① 写的人要重复 125 遍几乎相同的 12 个字段；
 *   ② 新增素材时忘了写 → 那件素材在整页上"不换肤"，看起来像 bug；
 *   ③ 调一次品牌色要改 125 处。
 *
 * ## 为什么不只做"纯正则推断"
 *
 * 纯正则**会漏**，而且漏得静默。实测：第一版规则表跑过 168 个真实 id 之后，
 * 有 17 套模板落进"谁都匹配不上"（`tpl-tangzhi`「唐制」、`tpl-mistveil`、
 * `tpl-bambooherm`、`tpl-qinggong`、`tpl-shuhua`…）——
 * 它们照常能应用、照常渲染、不报错，只是**整页不换肤**。
 * 用户感受是"我花了钱，怎么跟没装修一样"。
 *
 * ## 所以：mood 是中间层
 *
 *   id ──(规则表 / 显式覆盖表)──▶ mood ──(MOOD_SKIN)──▶ token
 *
 * 好处：
 *   · token 只维护 **7 份**（一个 mood 一份），调色改一处；
 *   · 覆盖率**可断言** —— `verify-decor-skin.mjs` 会 dump 全部真实 id
 *     跑一遍，落回 `plain` 的必须命中白名单，否则变红；
 *   · 新增素材时：要么被规则命中（自动），要么进 `MOOD_OVERRIDE` 点明（显式），
 *     两条路必居其一，不存在"默默不换肤"这第三种状态。
 *
 * ## 显式 `skin` 仍然最高优先
 *
 * 若某件素材观感特殊（例如刻意撞色的模板），素材上直接写
 * `skin: Partial<SkinTokens>`，它会在 mood 推断之上覆盖。
 * 所以这套是"约定优于配置"，不是"无法覆盖"。
 *
 * ## ⚠️ 顺序很重要
 *
 * `MOOD_RULES` 按数组顺序取**首个**命中，因此：
 *   · 模板规则必须排在通用素材规则之前（否则 `clan-tpl-imperial`
 *     会被 `imperial` 通用规则先接住 —— 结果碰巧对，但同类会失手）；
 *   · `night` 必须排在 `imperial` 之前（星河壁纸的 id 里同时含
 *     `star` 与 …… 实为互斥，但 `tpl-starry3d` 这类会同时被两条命中，
 *     深色底必须赢，否则深底色配浅金字会看不清）。
 */

/**
 * 调子（mood）：素材"气质"的枚举。7 档，**每档肉眼可分辨**。
 */
export type SkinMood =
  | "plain"      // 素白：默认态，无描金
  | "muted"      // 沉静（水墨 / 素纸 / 竹影）：低饱和、淡描
  | "earth"      // 素朴（夯土 / 青石 / 砖）
  | "wood"       // 楠木 / 木作
  | "vermilion"  // 朱漆官式
  | "imperial"   // 鎏金御制：最高档
  | "night";     // 深空 / 星河

/** mood → token。**每档必须能被肉眼分辨**（AGENTS.md 要求"明显区别"） */
const MOOD_SKIN: Record<SkinMood, Partial<SkinTokens>> = {
  plain: {},
  muted: {
    primary: "#7c7a72",
    secondary: "#a8a49a",
    gilt: "#b08a34",
    radius: "8px",
    titleWeight: 500,
    titleTracking: "0.08em",
    shadow: 0.3,
    cardTexture: "linear-gradient(180deg, rgba(255,255,255,.72), rgba(248,246,240,.78))",
  },
  earth: {
    primary: "#8a6a3e",
    secondary: "#a89070",
    radius: "8px",
    borderStyle: "solid",
    titleWeight: 500,
    titleTracking: "0.06em",
    shadow: 0.35,
    cardTexture: "linear-gradient(180deg, rgba(255,252,246,.9), rgba(246,238,226,.86))",
  },
  wood: {
    primary: "#6d4c26",
    secondary: "#8a6a3e",
    gilt: "#d4af37",
    radius: "6px",
    borderStyle: "double",
    titleWeight: 700,
    titleTracking: "0.12em",
    shadow: 0.55,
    dividerPattern: "repeating-linear-gradient(90deg, #d4af3766 0 6px, transparent 6px 12px)",
    cardTexture: "linear-gradient(180deg, rgba(255,250,240,.94), rgba(244,232,212,.9))",
  },
  vermilion: {
    primary: "#8e2018",
    secondary: "#a3281f",
    gilt: "#d4af37",
    radius: "6px",
    borderStyle: "solid",
    titleWeight: 700,
    titleTracking: "0.1em",
    shadow: 0.65,
    dividerPattern: "repeating-linear-gradient(90deg, #d4af3799 0 8px, transparent 8px 16px)",
    cardTexture: "linear-gradient(180deg, rgba(255,250,244,.95), rgba(252,236,230,.9))",
    buttonBg: "#8e2018",
  },
  imperial: {
    primary: "#c9a240",
    secondary: "#8b6a1e",
    gilt: "#e8c568",
    radius: "4px",
    borderStyle: "double",
    titleWeight: 700,
    titleTracking: "0.16em",
    shadow: 1,
    dividerPattern:
      "repeating-linear-gradient(90deg, #e8c568cc 0 10px, transparent 10px 18px), " +
      "repeating-linear-gradient(90deg, #c9a24055 0 2px, transparent 2px 18px)",
    cardTexture:
      "radial-gradient(circle at 12% 8%, rgba(232,197,104,.22), transparent 42%), " +
      "linear-gradient(180deg, rgba(255,252,242,.96), rgba(252,240,214,.92))",
    buttonBg: "#8b6a1e",
  },
  night: {
    primary: "#8fa8cf",
    secondary: "#6a7f9e",
    gilt: "#cfe0ff",
    radius: "14px",
    titleWeight: 500,
    titleTracking: "0.1em",
    shadow: 0.8,
    dividerPattern: "repeating-linear-gradient(90deg, #cfe0ff66 0 4px, transparent 4px 14px)",
    dark: true,
  },
};

/**
 * id 前缀 → mood。
 *
 * ⚠️ 这里必须**覆盖 id 里实际出现的写法**，而不是"我觉得应该有的写法"。
 * 踩过两次：
 *   ① 最初只写了 `gilt|imperial|dragon|brocade`，结果 `tpl-goldhall`（金殿，
 *      库里真实存在）一个都不命中 —— "gold" 与 "gilt" 是两个词；
 *   ② 修完之后又有 17 套模板落进"谁都匹配不上"（`tpl-tangzhi`「唐制」、
 *      `tpl-mistveil`、`tpl-bambooherm`、`tpl-qinggong`、`tpl-shuhua`…），
 *      它们本该是「沉静」调，却因为是空的而**完全不换肤**。
 * 教训：写完规则表，去库里 dump 一遍真实 id 做**覆盖率检查**
 * （`verify-decor-skin.mjs` §2 现在锁这条：ids 命中率必须 100%）。
 *
 * ⚠️ **模板规则必须排在素材规则之前判定**（本表按数组顺序取首个命中）。
 *    `clan-tpl-imperial` 若不先被模板规则接到，会被 `imperial` 通用规则
 *    接住 —— 结果碰巧对，但 `clan-tpl-plain` 这类会被 `plain` 抢走。
 *    所以下面按"先 clan-tpl / tpl，再 clan- / 通用素材"排列。
 */
const MOOD_RULES: { test: RegExp; mood: SkinMood }[] = [
  // ---- 1. 模板：先判，且从最贵到最素 ----
  { test: /(^|-)tpl-.*(dragon|imperial|gilt|gold|brocade|tenghzi|tangzhi|tang)/i, mood: "imperial" },
  { test: /(^|-)tpl-.*(starry|starfield|night)/i, mood: "night" },
  { test: /(^|-)tpl-.*(vermilion|zhuqi|thronehall|hallplaque|bannerhall|xianghuo|lacquer)/i, mood: "vermilion" },
  { test: /(^|-)tpl-.*(ancestral|ancestorshrine|ancestral3d|nanmu|earthancient|carved)/i, mood: "wood" },
  { test: /(^|-)tpl-.*(inkwash|inkspace|mistveil|bambooherm|clearfrost|paper|shuhua|qinggong|zheping|yingbi|gongdeng|whitewash|stoneterrace)/i, mood: "muted" },
  { test: /(^|-)tpl-.*(goldhall|goldweave)/i, mood: "imperial" },

  // ---- 2. 深色底素材（必须在金色规则之前，night 与 gilt 会同时命中）----
  { test: /star|deepstar|night|moon|ponder|vault|galaxy|starfield/i, mood: "night" },

  // ---- 3. 最高档：鎏金 / 御制 / 云龙 / 织锦 / 藻井 ----
  { test: /gilt|gold|imperial|dragon|brocade|jinluan|jiuzhong|caisson|ninesilk|ninefive/i, mood: "imperial" },

  // ---- 4. 朱漆 / 官式 ----
  { test: /vermilion|lacquer|throne|hallplaque|bannerhall|xianghuo/i, mood: "vermilion" },

  // ---- 5. 木作 / 楠木 / 沉穆 ----
  { test: /nanmu|ancestor|carved|wood|zhuan|ancestral/i, mood: "wood" },

  // ---- 6. 沉静：水墨 / 宣纸 / 竹影 / 纱 / 汉白 / 素屏 ----
  //     注意 `mist` 要**先于** `marble` 之外什么也不冲突，但 `hanbai`（汉白玉）
  //     是"清贵"而不是"素朴青石"，所以放这边。
  { test: /inkwash|inklandscape|inkspace|mist|bamboo|paper|shuhua|qinggong|zheping|yingbi|clearfrost|hanbai|white|marble|plain|fret|song|scholar|cloud/i, mood: "muted" },

  // ---- 7. 素朴：夯土 / 青石 / 砖 ----
  { test: /earth|stone|granite|brick|straw|plaster/i, mood: "earth" },
];

/**
 * 显式 mood 覆盖表：规则表猜不出、或猜错了的那些 id。
 *
 * 为什么要这张表而不是"改正则"：正则一改会**波及其它素材**
 * （例如给 `tpl-tangzhi` 加规则时若写成 `/tang/`，会把 `tpl-tangzhi`
 * 之外的任何含 "tang" 的 id 一起捞进来）。精确到件的例外放这里最安全。
 *
 * 每加一条都要写明**为什么规则表猜不到**。
 */
const MOOD_OVERRIDE: Record<string, SkinMood> = {
  /*
    `tpl-plain`（素白）与 `clan-tpl-plain`（素祠）是**免费档的对照基准**，
    必须是 plain。若落进 muted，免费用户一进馆就会看到淡描金分隔线 ——
    于是"免费 vs 入门"这个落差就消失了（而这正是整件事要修的毛病）。
    ⚠️ 它们的 name 里含 "plain"，本该被 muted 规则的 `plain` 关键词接住 ——
    所以这里是**故意**越过规则表的例外，别删。
  */
  "tpl-plain": "plain",
  "clan-tpl-plain": "plain",
  // 「唐制」是最高档制式，但 id 里没有 imperial/gilt/gold 任何关键词 ——
  // 规则表只能靠 `tangzhi` 这个词，放在 MOOD_RULES 里会与"唐朝"语义混淆。
  "tpl-tangzhi": "imperial",
  // 莲池：水景，既不是白也不是木，该是"沉静"而非默认素白。
  "tpl-lotuswake": "muted",
  "tpl-lotuswake3d": "muted",
  "wall-lotuspond": "muted",
  // 「暖」「素麻」是中性底色，不该被当成"什么都没有"。
  "wall-warm": "earth",
  // 宗祠的门楼 / 天井 / 香火堂：都是**砖石木构**，该落在素朴档而不是素白。
  // （它们的 id 里既没有 earth/stone/brick，也没有 wood/nanmu，
  //   规则表接不住，必须逐件点明。）
  "clan-tpl-gateway": "earth",
  "clan-tpl-courtyard": "earth",
  "clan-tpl-incensehall": "earth",
  "tpl-niche": "plain",
  // 未选素材的占位项：必须是**明确的素白**，不能落进任何彩色规则。
  "wall-plain": "plain",
  "floor-none": "plain",
  "orn-none": "plain",
  "frame-none": "plain",
  "clan-wall-white": "plain",
  "clan-orn-none": "plain",
  "clan-floor-plain": "plain",
  "clan-frame-plain": "plain",
  // 宗祠的石狮 / 香炉 / 牌位墙 / 长幡 / 供桌 / 立柱：
  // 这些是**祠堂固有的仪制构件**，家家都有、不体现"豪华度"，
  // 让它们把整页推成 wood（描金）会让最便宜的宗祠也显得金光闪闪。
  "clan-orn-lion": "plain",
  "clan-orn-censer": "plain",
  "clan-orn-tablet-wall": "plain",
  "clan-orn-pillar": "plain",
  "clan-orn-altar": "plain",
  "clan-orn-lantern": "plain",
  "clan-orn-scroll": "plain",
  "clan-orn-candlestick": "plain",
  "clan-orn-banner": "plain",
  "clan-orn-plaque-pair": "plain",
  "clan-orn-screen-wall": "plain",
  "clan-orn-screen": "plain",
  // 字体：楷/隶/宋是"字体选择"，不该改变整页气质的豪华度。
  "font-kai": "plain",
  "font-serif": "plain",
  "font-modern": "plain",
  "font-fangsong": "plain",
  "clan-font-kai": "plain",
  "clan-font-li": "plain",
  "clan-font-song": "plain",
};

/** 从单件 id 判定 mood（显式覆盖优先，其次规则表，最后素白） */
export function moodOf(id: string): SkinMood {
  const ov = MOOD_OVERRIDE[id];
  if (ov) return ov;
  for (const r of MOOD_RULES) {
    if (r.test.test(id)) return r.mood;
  }
  return "plain";
}

/** mood → token 增量的对外视图（验收脚本会核对 mood 覆盖率高） */
export function skinOfMood(mood: SkinMood): Partial<SkinTokens> {
  return MOOD_SKIN[mood];
}

/**
 * 从一组 id 里推断 skin 增量。
 *
 * ⚠️ **不是"第一个命中就返回"**。多件素材叠加时，只取第一件会让
 * "壁纸是素白的 + 挂了鎏金灯笼"这种组合看不出任何变化 ——
 * 而用户花钱买的恰恰是那盏灯笼。这里按 **mood 的豪华度取最大值**：
 * 谁最贵，整页就按谁的气质走。
 */
const MOOD_RANK: Record<SkinMood, number> = {
  plain: 0,
  muted: 1,
  earth: 1,
  wood: 2,
  vermilion: 3,
  night: 3,
  imperial: 4,
};

function inferSkin(ids: string[]): { skin: Partial<SkinTokens>; mood: SkinMood } {
  let best: SkinMood = "plain";
  for (const id of ids) {
    const m = moodOf(id);
    if (MOOD_RANK[m] > MOOD_RANK[best]) best = m;
  }
  return { skin: MOOD_SKIN[best], mood: best };
}

/** 槽位合并顺序（**顺序即优先级，靠后的覆盖靠前的**） */
const SLOT_ORDER: DecorSlot[] = ["wall", "floor", "ornament", "frame", "font"];

/** 允许素材自带 skin 的宽松形状（两端 DecorItem 都兼容，且不 import 具体库以免环形依赖） */
type SkinCarrier = {
  id?: string;
  skin?: Partial<SkinTokens>;
};

/** 一份"可参与换肤判定"的素材查表结果 */
export type SkinSources = {
  /** 槽位 → 该槽位选中的素材（含可选 skin） */
  items?: Partial<Record<DecorSlot, SkinCarrier | undefined>>;
  /** 当前模板（含可选 skin）；模板粒度最高 */
  template?: SkinCarrier & { id?: string };
};

/**
 * 合并顺序：`DEFAULT_SKIN → 槽位素材 → 模板`。
 *
 * ⚠️ **模板必须最后合并**。原因见文件头「三段合并顺序」：
 *    用户挑的是整套气质，单件素材只是零件；若素材能盖住模板，
 *    用户点了「鎏金宝殿」再换张壁纸，整页气质就被那张壁纸带跑了 ——
 *    而模板才是他真正花钱买的东西。
 *
 * 每件素材的增量来源：**优先用它自己声明的 `skin`**（显式覆盖），
 * 没有则按 id 前缀从 `LUX_PATTERNS` 推断。这条"显式优先"必须有，
 * 否则一旦某件素材观感特殊，就只能去改全局正则 —— 那会波及其它素材。
 */
export function skinOf(
  decor: Pick<HallDecor, "slots" | "templateId"> | undefined,
  sources: SkinSources = {},
): SkinTokens {
  let out: SkinTokens = { ...DEFAULT_SKIN };

  for (const slot of SLOT_ORDER) {
    const item = sources.items?.[slot];
    if (!item) continue;
    const inferred = item.id ? inferSkin([item.id]).skin : {};
    out = { ...out, ...inferred, ...(item.skin ?? {}) };
  }

  const tpl = sources.template;
  if (tpl) {
    const inferred = tpl.id ? inferSkin([tpl.id]).skin : {};
    out = { ...out, ...inferred, ...(tpl.skin ?? {}) };
  }

  /*
    模板缺省但槽位有值时的兜底：`sources.template` 可能还没传进来
    （调用方只解析了槽位）。这时 decor.templateId 仍然能提供推断依据 ——
    否则会出现"同一个模板，在 A 页换肤、在 B 页不换肤"的诡异差异。
  */
  if (!tpl && decor?.templateId) {
    out = { ...out, ...inferSkin([decor.templateId]).skin };
  }

  return out;
}

/**
 * 只取 mood（不合成完整 token）—— 验收脚本用它做**覆盖率检查**：
 * 125 件素材 + 43 套模板里，落回 `plain` 的必须是白名单里的项。
 * 这条能抓出"新加了一件豪华素材但规则表没跟上"（它不报错、只是不换肤）。
 */
export function skinMoodOf(decor: Pick<HallDecor, "slots" | "templateId"> | undefined): SkinMood {
  const ids: string[] = [];
  for (const slot of SLOT_ORDER) {
    const v = decor?.slots?.[slot];
    // 阶段 9 起 ornament 是 string[]，其余槽位仍是 string
    if (Array.isArray(v)) ids.push(...v);
    else if (v) ids.push(v);
  }
  if (decor?.templateId) ids.push(decor.templateId);
  if (!ids.length) return "plain";
  let best: SkinMood = "plain";
  for (const id of ids) {
    const m = moodOf(id);
    if (MOOD_RANK[m] > MOOD_RANK[best]) best = m;
  }
  return best;
}

/**
 * 把 skin 转成 CSS 自定义属性（内联 style 对象）。
 *
 * 变量名统一 `--skin-*` 前缀，避免与 Tailwind / 别的组件设的变量撞车。
 * 值是**纯字符串**，不含 `var()` 嵌套 —— 嵌套会让"到底生效了哪个值"
 * 变成一件要开 devtools 才说得清的事。
 */
export function skinVars(skin: SkinTokens): Record<string, string> {
  return {
    "--skin-primary": skin.primary,
    "--skin-secondary": skin.secondary,
    "--skin-gilt": skin.gilt,
    "--skin-radius": skin.radius,
    "--skin-border-style": skin.borderStyle,
    "--skin-divider": skin.dividerPattern ?? "none",
    "--skin-card-texture": skin.cardTexture ?? "none",
    "--skin-button-fg": skin.buttonFg,
    "--skin-button-bg": skin.buttonBg,
    "--skin-title-weight": String(skin.titleWeight),
    "--skin-title-tracking": skin.titleTracking,
    "--skin-shadow-strength": String(skin.shadow),
    /*
      标题色。刻意做成"由 dark 推导"的 token 而不是再加一个独立字段 ——
      独立字段必然会与 dark 漂移（改了 dark 忘改 titleColor，深底上就出深字，
      整段标题看不见，而且几乎没人会去回归测这个）。
    */
    "--skin-title-color": skin.dark ? "#f7f4ec" : "#1f262e",
    /*
      `--skin-dark` 用 **0/1** 而不是 true/false：
      它要被 `color-mix()` 之类的 CSS 数学直接乘进去，
      写成布尔串会让 `calc()` 静默失效（不报错、只是不生效）。
    */
    "--skin-dark": skin.dark ? "1" : "0",
  };
}

/**
 * 把"外部判定的深色"回写进 skin。
 *
 * ## 为什么必须有这一步（**这是阶段 4 抓到的一个真 bug**）
 *
 * 灰度期深色判定是 `skin.dark || 旧硬编码列表`（见两个公页）。两者**不重合**：
 * 例如宗祠的 `clan-wall-brick`（青砖）在旧列表里算深色（`CLAN_DARK_WALLS`），
 * 但按新的 mood 规则它是 `earth` 档 → `skin.dark === false`。
 *
 * 于是出现自相矛盾的渲染：**文字判定说"深底"→ 用浅色字**，
 * 而**卡片底色来自 skin → 是浅米色卡**。
 * 结果：浅色字压在浅米卡上 —— 「字辈诗 · 派语」整段几乎看不见。
 *
 * 截图上看到的就是这个（`.shots/stage4-clan.png`）。
 * 这不是"某条 token 配错了"，是**判定源分叉**：
 * 文字用一个判据、底色用另一个判据，两者必然在边界素材上打架。
 *
 * ## 解法：让并集判定**回写**成 skin 的一部分
 *
 * 一旦 effective dark 为真，就把整套深色基底铺上（深底 + 浅字 + 去掉浅色底纹），
 * 保证"字色与底色来自同一个判据"。这样：
 *   · 边界素材（旧列表说是深、新规则说是浅）→ 一律按深色走，字看得见；
 *   · 真·深色素材（星河）→ 本来就该深，不受影响；
 *   · 浅色素材 → `effDark` 为假，原样返回，零变化。
 *
 * ⚠️ **代价与取舍**：`clan-wall-brick` 这种"其实是浅灰砖"的素材会被
 *    强制套上深色基底（旧行为如此，本阶段不改）。这是**有意保留旧观感** ——
 *    灰度期的目标是"零回归"，不是"顺手把旧判据也修对"。等旧列表撤掉后，
 *    这些素材会自然回到浅色基底。
 */
export function withDark(skin: SkinTokens, dark: boolean): SkinTokens {
  if (!dark || skin.dark) return skin;
  return {
    ...skin,
    dark: true,
    gilt: skin.gilt === "transparent" ? "#d4af37" : skin.gilt,
    titleWeight: Math.max(skin.titleWeight, 600),
    shadow: Math.max(skin.shadow, 0.5),
    /*
      深底上**必须**去掉浅色底纹：底纹是给浅底卡片准备的（米白/纸感），
      铺到深底上会变成一块块浅色补丁，反而更糟。
      分隔线图案同理（深底上要淡金细线，不要原来的深色纹）。
    */
    cardTexture: null,
    dividerPattern: "repeating-linear-gradient(90deg, #d4af3766 0 6px, transparent 6px 14px)",
  };
}

/**
 * 换肤是否"真的发生了"。
 *
 * 用途：`data-skin="on" | "off"`。断言与排查都靠它一眼分辨
 * 「这页是不是装修过」—— 比逐条比 CSS 变量稳得多，
 * 而且它也是产品口径的机器化表达：**装修过就该看得出来**。
 *
 * 判定：描金非透明，或圆角/字重/阴影任一项偏离素白基准。
 * 刻意**不**把 `primary !== DEFAULT.primary` 当判据 ——
 * 素朴档的主色本来就是接近基准的赭石色，用它当判据会把
 * "确实换了壁纸但配色相近"误判成未装修。
 */
export function skinIsActive(skin: SkinTokens): boolean {
  return (
    skin.gilt !== DEFAULT_SKIN.gilt ||
    skin.radius !== DEFAULT_SKIN.radius ||
    skin.titleWeight !== DEFAULT_SKIN.titleWeight ||
    skin.shadow !== DEFAULT_SKIN.shadow ||
    skin.cardTexture !== null ||
    skin.dividerPattern !== null
  );
}

/* ===========================================================================
 * 以下三个函数是**页面侧的接驳点**。
 *
 * 它们把"要用哪几个 CSS 变量、怎么组合"收在这里，
 * 而不是让馆页 / 祠页各自手写一遍内联 style ——
 * 两页手写的必然结果是漂移（一处改了圆角、另一处没改），
 * 而"两个页面不统一"正是用户这次提的核心抱怨之一。
 *
 * 用法：
 *   <div className={cardCls} style={skinCardStyle()}>…</div>
 *   <h2 className={titleCls} style={skinTitleStyle()}>…</h2>
 *
 * ⚠️ 返回值一律是 `CSSProperties`，**只含变量引用，不含具体颜色**。
 *    具体颜色来自祖先节点注入的 `--skin-*`，所以同一个 style 对象
 *    在"未装修"（gilt = transparent）与"豪华"（gilt = 真金）下
 *    渲染结果天然不同 —— 不需要把 skin 传进每个组件。
 * =========================================================================== */

/**
 * 卡片容器：圆角 / 边框样式 / 底纹 / 阴影强度 全部随皮肤走。
 *
 * ⚠️ 深色档的底纹走 `--skin-card-texture`（由 `withDark()` 置为 `none`），
 *    实际底色由页面的 Tailwind class 提供（`bg-white/10 backdrop-blur`）——
 *    因为深色卡需要 `backdrop-filter` 才好看，那不是变量能表达的。
 *    所以这里只负责"浅色档的底纹 + 两侧通用的圆角/边框/阴影"。
 */
export function skinCardStyle(): CSSProperties {
  return {
    borderRadius: "var(--skin-radius, 10px)",
    borderStyle: "var(--skin-border-style, solid)",
    /*
      描金边框只在"豪华档"才粗 —— 用 `color-mix` 把 gilt 与主色按
      `--skin-shadow-strength` 混一档，素白档 gilt=transparent 时
      混出来的仍是透明的，所以免费页的边框仍然是灰的（不会发金）。
      若写成固定 `border-color: var(--skin-gilt)`，免费页的边框会
      变成 `transparent` —— 边框直接消失，比不装修还难看。
    */
    borderColor:
      "color-mix(in srgb, var(--skin-gilt, transparent) calc(var(--skin-shadow-strength, 0.15) * 100%), var(--skin-secondary, #9a938a))",
    backgroundImage: "var(--skin-card-texture, none)",
    boxShadow:
      "0 calc(var(--skin-shadow-strength, 0.15) * 18px) calc(var(--skin-shadow-strength, 0.15) * 40px) rgba(24,16,8,calc(var(--skin-shadow-strength, 0.15) * 0.5))",
  };
}

/** 区块标题：颜色 / 字重 / 字距 / 描金下划线 随皮肤走 */
export function skinTitleStyle(): CSSProperties {
  return {
    color: "var(--skin-title-color, inherit)",
    fontWeight: "var(--skin-title-weight, 600)" as unknown as number,
    letterSpacing: "var(--skin-title-tracking, normal)",
    /*
      描金下划线：用 `background-image` 而不是 `border-bottom` ——
      border 会占布局高度（改变既有断言的几何前提），
      background 是纯绘制层，零布局影响。
    */
    backgroundImage:
      "linear-gradient(90deg, var(--skin-gilt, transparent) 0 2.4em, transparent 2.4em)",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "0 100%",
    backgroundSize: "100% 2px",
    paddingBottom: "0.2em",
  };
}

/** 页脚 / 入口按钮：前景 + 背景随皮肤走 */
export function skinButtonStyle(): CSSProperties {
  return {
    color: "var(--skin-button-fg, #ffffff)",
    backgroundColor: "var(--skin-button-bg, #a8744f)",
    borderRadius: "calc(var(--skin-radius, 10px) * 0.8)",
  };
}

/**
 * 描金分隔线：样式随皮肤走（素白档回落成一根淡素线）。
 *
 * ⚠️ 这里**不能**直接 `borderBottom: 1px solid var(--skin-gilt)`：
 *    素白档 gilt = transparent → 分隔线整条消失，页面会"缺一条线"，
 *    看起来像排版坏了。所以固定给一条 fallback 素色底线。
 */
export function skinDividerStyle(): CSSProperties {
  return {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    borderTopColor: "var(--skin-secondary, #e5e7eb)",
  };
}
