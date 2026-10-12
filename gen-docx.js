const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, BorderStyle, WidthType,
  ShadingType, PageBreak, PageNumber, Header, Footer
} = require("docx");

const FONT = { ascii: "Microsoft YaHei", eastAsia: "Microsoft YaHei", hAnsi: "Microsoft YaHei", cs: "Microsoft YaHei" };

// ---------- helpers ----------
function run(text, opts = {}) { return new TextRun({ text, font: FONT, ...opts }); }
function P(text, opts = {}) { return new Paragraph({ children: [run(text, opts.run || {})], ...(opts.par || {}) }); }
function brk() { return new Paragraph({ children: [new PageBreak()] }); }

// numbering
const numRefs = [];
for (let i = 0; i < 30; i++) numRefs.push("num" + i);
let numIdx = 0;
const numbering = {
  config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: "checks", levels: [{ level: 0, format: LevelFormat.BULLET, text: "□", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ...numRefs.map(r => ({ reference: r, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }))
  ]
};
function numList(items) {
  const ref = numRefs[numIdx++];
  return items.map(t => new Paragraph({ numbering: { reference: ref, level: 0 }, children: [run(t)] }));
}
function bulletList(items) { return items.map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [run(t)] })); }
function checkList(items) { return items.map(t => new Paragraph({ numbering: { reference: "checks", level: 0 }, children: [run(t)] })); }

// heading helpers
function H1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] }); }
function H2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] }); }
function H3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(text)] }); }

// callout box (left border + light shading)
function callout(title, text) {
  const kids = [];
  if (title) kids.push(run(title, { bold: true, color: "6B4517" }));
  if (title && text) kids.push(run("　"));
  if (text) kids.push(run(text));
  return new Paragraph({
    children: kids,
    shading: { type: ShadingType.CLEAR, fill: "FDF8EC", color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: "C9A24A", space: 8 } },
    spacing: { before: 120, after: 120, line: 288 },
    indent: { left: 120, right: 120 }
  });
}

// note box (gold left border, smaller)
function note(text) {
  return new Paragraph({
    children: [run(text, { size: 18, color: "8A5A20" })],
    shading: { type: ShadingType.CLEAR, fill: "FBF6EA", color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "D8B878", space: 8 } },
    spacing: { before: 80, after: 120, line: 264 },
    indent: { left: 120, right: 120 }
  });
}

// table builder
const CW = 9026; // content width A4 - 1in margins
const border = { style: BorderStyle.SINGLE, size: 4, color: "B9AD97" };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(text, w, opts = {}) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    verticalAlign: "center",
    children: [new Paragraph({ children: [run(text, opts.bold ? { bold: true, color: "403010" } : {})], spacing: { line: 264 } })]
  });
}
function kvTable(rows) {
  const wLabel = 2700, wVal = CW - wLabel;
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [wLabel, wVal],
    rows: rows.map(([k, v]) => new TableRow({
      children: [cell(k, wLabel, { bold: true, shading: "F3ECDD" }), cell(v, wVal)]
    }))
  });
}

const children = [];

// ===================== 封面 =====================
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600, after: 200 }, children: [run("深 圳 市 大 鹏 新 区", { size: 30, bold: true, color: "5E352A" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run("OPC 百企培育计划", { size: 24, bold: true, color: "403010", characterSpacing: 20 })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run("________________________________________", { color: "D8B878" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 120 }, children: [run("创业主体申请材料", { size: 44, bold: true, color: "403010" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run("—— 人工智能应用 · 数字文化产业 · 一人（OPC）轻量化创业 ——", { size: 18, color: "8A5A20" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [run("项目名称", { size: 22, bold: true, color: "403010" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run("宗忆堂 —— AI 驱动的数字祭祀与宗族文化传承平台", { size: 22, color: "1F1D1A" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [run("申请人（创始人）：陆苗苗", { size: 22, color: "423D33" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run("申报类别：人工智能应用 / 数字文化产业（OPC 一人公司）", { size: 20, color: "423D33" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 500 }, children: [run("申请提交日期：____ 年 ____ 月 ____ 日　　拟定申报批次：2026 年度", { size: 18, color: "8A5A20" })] }));
children.push(brk());

// ===================== 目录 =====================
children.push(H1("目　录"));
const toc = [
  "第一部分　创业主体申请表",
  "第二部分　项目一页纸简介",
  "第三部分　项目完整介绍",
  "第四部分　创始人（团队）介绍",
  "第五部分　极简版商业计划书",
  "第六部分　注册与项目推进时间表",
  "第七部分　项目匹配大鹏新区 OPC 百企培育计划政策说明",
  "第八部分　附件材料清单（扫描件粘贴页）",
  "第九部分　提交前自查清单与合规特别提醒",
  "附录　　提交与命名说明"
];
toc.forEach(t => children.push(P(t, { par: { spacing: { after: 60 } } })));
children.push(brk());

// ===================== 第一部分 =====================
children.push(H1("第一部分　创业主体申请表"));
children.push(kvTable([
  ["申请人（创始人）", "陆苗苗"],
  ["身份证号码", "452223200210020024"],
  ["联系电话", "13377078428"],
  ["电子邮箱", "13377078428@163.com"],
  ["现居住地址", "深圳市龙华区三联街道弓村14-4栋707室"],
  ["学历", "本科"],
  ["毕业院校", "天津商业大学 理学院 数据科学与大数据技术"],
  ["毕业时间", "2025-07"],
  ["年龄", "23 岁"],
  ["拟设立企业名称（备选 3 个）", "1. 深圳市宗忆堂数字科技有限公司\n2. 深圳市宗忆堂网络科技有限公司\n3. 深圳市宗忆堂文化科技有限公司"],
  ["企业类型", "有限责任公司（自然人独资，OPC 一人公司）"],
  ["注册资本", "10 万元（认缴）"],
  ["拟注册地址", "大鹏新区 OPC 社区集群注册地址（新区统一提供）"],
  ["项目名称", "宗忆堂 —— AI 驱动的数字祭祀与宗族文化传承平台"],
  ["所属赛道", "人工智能应用、数字文化产业"],
  ["项目模式", "一人 + AI 轻量化创业模式"],
  ["商标情况", "已取得“宗忆堂”第 45 类商标；正在申请补充第 42 类（网站服务）、35 类（电商）、9 类（APP 软件）商标"]
]));
children.push(note("注：「现居住地址」为申请人当前实际居住地址，与「拟注册地址」（大鹏新区 OPC 集群注册地址）为不同字段，二者可不一致，属正常情况。"));
children.push(H3("申请扶持诉求"));
children.push(P("依据大鹏新区 OPC 百企培育计划专项培育服务清单，本项目申请如下支持服务："));
children.push(...numList([
  "免费集群注册地址，用于工商注册落地；",
  "免租共享商务办公工位，适配单人轻量化创业；",
  "算力补贴支持，用于 AI 大模型调用、AI 语音克隆、平台开发训练；",
  "创业赋能培训：合规运营指导、互联网平台资质申报、政策申报辅导；",
  "政务帮办服务，企业开办、税务、银行开户一站式咨询；",
  "项目展示推广、政策精准推送服务，对接新区数字文化产业资源。"
]));
children.push(brk());

// ===================== 第二部分 =====================
children.push(H1("第二部分　项目一页纸简介"));
children.push(kvTable([
  ["项目名称", "宗忆堂 —— AI 驱动的数字祭祀与宗族文化传承平台"],
  ["一句话定位", "以 AI 技术为核心，打造集宗族文化传播、网络祭祀、云端宗祠、AI 情感陪伴于一体的数字文化垂直平台。"]
]));
children.push(H3("一、解决行业痛点"));
children.push(...numList([
  "传统祭扫受地域、时间约束，异地亲人无法便捷追思缅怀；",
  "宗族族谱、宗祠记忆缺少数字化载体，传统文化面临断代风险；",
  "殡葬祭祀线上市场缺少合规可信平台，行业服务粗放、信息透明度不足。"
]));
children.push(H3("二、核心产品模块"));
children.push(...numList([
  "数字纪念馆：实名认证开通，上传逝者生平，线上祭拜留言；",
  "云端宗祠系统：家族树、电子族谱、宗亲线上互动；",
  "AI 对话系统“午夜悄悄话”：基于逝者生平数据库，语音克隆实现 AI 语音情感对话，内置完整授权合规机制；",
  "虚拟商城 & 纪念馆装修系统：免费基础模板 + 多档位付费个性化套装。"
]));
children.push(P("产品规划三端同步：小程序优先，再上线 Web、APP。"));
children.push(H3("三、项目当前进展"));
children.push(...numList([
  "完成完整产品规划、技术架构、内容合规体系、AI 对话系统方案；",
  "MVP 开发路线图确定，依托 DeepSeek 等 AI 工具单人轻量化开发；",
  "持有核心商标，多类别商标正在申报；",
  "全套开发工具链就绪，创始人具备数据建模、Python 开发能力。"
]));
children.push(H3("四、商业模式"));
children.push(P("收入来源：纪念馆付费装修套装、虚拟祭品、平台增值会员服务；后期接入实体文化衍生商品电商。"));
children.push(H3("五、项目与大鹏 OPC 适配说明"));
children.push(P("本项目属于人工智能 + 数字文化，是大鹏新区 OPC 先导区重点扶持赛道，采用 OPC 典型的“一人 + AI”轻量化创业模式，不需要大规模线下场地，契合新区百企培育计划定位。"));
children.push(H3("六、落地时间规划"));
children.push(...bulletList([
  "2026-11：企业核名、工商注册；",
  "2026-12：税务登记、银行对公开户；",
  "2027-01 至 2027-03：MVP 产品内测；",
  "2027-04：完成 ICP 备案，Web 端正式上线。"
]));
children.push(brk());

// ===================== 第三部分 =====================
children.push(H1("第三部分　项目完整介绍"));
children.push(H3("3.1 行业市场机会"));
children.push(P("全国殡葬服务市场规模超 4000 亿元，年复合增长率约 8.1%；国内云祭祀相关企业数量超 9400 家，数字祭祀赛道持续增长。国家政策大力倡导节地生态安葬、鼓励线上数字化祭祀创新。当前多数线上祭祀平台功能同质化，缺少 AI 情感交互 + 宗族族谱文化深度结合的产品，市场存在差异化机会。"));
children.push(H3("3.2 产品详细方案"));
children.push(...numList([
  "实名认证机制：所有用户实名注册，从源头落实内容合规，规避风险；",
  "数字纪念馆模块：逝者档案、影像资料存储、线上献花、留言追思；",
  "云端宗祠：家族成员录入、族谱生成、宗亲联络，保护宗族文化；",
  "AI 语音对话系统（午夜悄悄话）"
]));
children.push(callout("合规前置说明：", "必须取得逝者家属书面授权，方可录入生平素材、进行语音克隆；系统内置授权留痕模块，不允许无授权生成 AI 模拟逝者。"));
children.push(...numList([
  "虚拟装修商城：基础模板免费，三层九档付费套装，满足不同用户个性化需求。"
]));
children.push(H3("3.3 合规风险说明"));
children.push(P("本项目业务涉及互联网人文缅怀内容，项目设计阶段已把合规嵌入产品架构："));
children.push(...numList([
  "强制实名认证；",
  "完整的 AI 克隆授权、材料上传授权留痕；",
  "建立内容审核机制，敏感内容过滤；",
  "后续按监管要求办理 ICP 备案、互联网相关许可资质；",
  "一人有限公司严格执行公私账户分离，建立财务制度，每年做审计。"
]));
children.push(H3("3.4 技术实现路径"));
children.push(P("采用轻量化 OPC 模式，创始人利用 DeepSeek 大模型、Python、SQL 完成产品开发，减少团队人力成本；产品分阶段迭代，先 MVP 最小可行产品验证市场，再迭代完整功能。"));
children.push(brk());

// ===================== 第四部分 =====================
children.push(H1("第四部分　创始人（团队）介绍"));
children.push(P("本项目为 OPC 一人创业项目，核心负责人陆苗苗，具备数据科学、建模、AI 应用能力。"));
children.push(H3("陆苗苗 ｜ 创始人 / 产品负责人"));
children.push(H3("教育背景"));
children.push(P("天津商业大学，数据科学与大数据技术本科，2025-07 毕业；GPA 3.24/4.0（专业前 10%）；校三好学生、优秀毕业生，获得二等奖学金、三等奖学金。"));
children.push(H3("专业证书"));
children.push(...numList([
  "BDA 中级数据分析师；",
  "数字技术工程师（人工智能平台产品实现）；",
  "2023 全国大学生数学建模竞赛天津赛区二等奖。"
]));
children.push(H3("专业技术栈"));
children.push(P("熟练 Python（pandas、NumPy、Matplotlib）、MySQL-SQL、Excel 自动化报表；掌握 Tableau、SPSS；擅长回归分析、聚类、客户分层、综合评分建模；具备业务报表设计、自动化脚本开发能力。"));
children.push(H3("工作履历：深圳汇银信用咨询有限公司 ｜ 数据专员（2025-08 至 2026-08）"));
children.push(...numList([
  "日均处理 4 万 + 业务数据，处理准确率 99%；",
  "独立搭建趋势预测、客户分层、资产评级三套业务模型落地使用；",
  "开发自动化校验脚本，万级数据校验由 2 小时缩短至 5 分钟，效率提升 96%；",
  "报表自动化改造，人工耗时缩减 95%。"
]));
children.push(H3("过往项目成果"));
children.push(...numList([
  "资产包智能评级系统：四大评估维度，模型预测准确率 85%，评级时间由 2-4 天缩短至 10 分钟，效率提升 95%；",
  "基于回归模型的蔬菜定价与补货决策研究：Python 数据处理效率提升 90%。"
]));
children.push(H3("校园综合经历"));
children.push(P("校星海艺术团舞蹈分团团长（2022.05-2024.05）；统筹 7 场校级大型晚会节目编排，负责招新、对外宣传，公众号产出 30+ 原创推文，具备项目统筹、内容运营经验。"));
children.push(H3("在本项目中的职责"));
children.push(P("项目整体规划、产品设计、AI 技术落地、数据运营、合规体系建设、政策申报对接。"));
children.push(H3("项目独特优势"));
children.push(...numList([
  "轻量化降本优势：一人 + AI 模式，依托现有 AI 开发工具，单人完成主要开发，大幅降低初创成本，完美契合 OPC 一人公司定位；",
  "数据驱动：拥有成熟建模、数据分析实战经验，可直接用于用户运营、产品迭代；",
  "合规先行：产品顶层设计内置实名认证、AI 授权、内容审核模块；",
  "品牌前置布局：已经注册“宗忆堂”商标，完成品牌知识产权布局。"
]));
children.push(brk());

// ===================== 第五部分 =====================
children.push(H1("第五部分　极简版商业计划书"));
children.push(H3("模块一：市场机会"));
children.push(...numList([
  "国内殡葬市场规模 4000 亿 +，数字化祭祀赛道政策鼓励，市场处于上升周期；",
  "现有平台大多只做简单线上祭拜，缺少 AI 情感交互 + 宗族族谱数字化的垂直产品；",
  "远程祭扫、宗族文化数字化需求持续增长。"
]));
children.push(H3("模块二：产品与服务"));
children.push(P("核心产品：数字纪念馆、云端宗祠、AI 语音对话、虚拟商城；交付形态：小程序（优先）- Web 网页 - APP 分阶段上线；业务类型：数字文化互联网平台，虚拟增值服务为主。"));
children.push(H3("模块三：竞争优势"));
children.push(...numList([
  "合规差异化：强实名认证 + 完整 AI 授权留痕，建立用户信任；",
  "AI 差异化：行业内带授权机制的逝者语音 AI 对话系统，提供情感陪伴；",
  "定位差异化：不只做祭扫，同时聚焦宗族文化传承，和普通云祭祀平台做区分。"
]));
children.push(H3("模块四：财务预测"));
children.push(callout("说明：", "以下仅为项目预测，不构成收益承诺。"));
children.push(...numList([
  "第一阶段（上线首年）：仅虚拟数字产品，预计年收入约 100 万元，净利率 70% 以上；",
  "第二阶段（第 2-3 年）：接入实体衍生商品商城，年收入 500-1500 万元，净利率约 10%；",
  "第三阶段（第 4-5 年）：目标注册用户 150 万，年收入 3000 万元。"
]));
children.push(H3("模块五：资金规划需求"));
children.push(...numList([
  "个人 MVP 开发阶段：启动资金约 1-1.5 万元；",
  "公司化运营首年整体预算 5-8 万元；",
  "希望依托大鹏 OPC 政策，获得注册地址、办公空间、算力补贴、创业培训，降低创业成本。"
]));
children.push(brk());

// ===================== 第六部分 =====================
children.push(H1("第六部分　注册与项目推进时间表"));
children.push(new Table({
  width: { size: CW, type: WidthType.DXA },
  columnWidths: [2700, CW - 2700],
  rows: [
    new TableRow({ children: [cell("时间节点", 2700, { bold: true, shading: "F3ECDD" }), cell("核心任务", CW - 2700, { bold: true, shading: "F3ECDD" })] }),
    new TableRow({ children: [cell("2026-11", 2700), cell("企业备选名称提交、工商核名，办理营业执照", CW - 2700)] }),
    new TableRow({ children: [cell("2026-12", 2700), cell("完成税务信息确认、开立对公银行账户；落实 OPC 集群注册地址", CW - 2700)] }),
    new TableRow({ children: [cell("2027-01 ~ 03", 2700), cell("完成 MVP 版本开发，内部封闭测试；完善合规文档", CW - 2700)] }),
    new TableRow({ children: [cell("2027-04", 2700), cell("完成 ICP 备案，Web 端正式对外开放；小程序同步上线", CW - 2700)] })
  ]
}));
children.push(callout("重要提示：", "作为自然人独资 OPC 一人有限公司，将严格做到公私账户分离，建立财务制度，按要求做年度审计，规避股东连带责任风险。注册后按时税务登记，每年完成工商年报。"));
children.push(brk());

// ===================== 第七部分 =====================
children.push(H1("第七部分　项目匹配大鹏新区 OPC 百企培育计划政策说明"));
children.push(P("大鹏新区 OPC 百企培育计划重点征集人工智能、数字文化方向轻量化 OPC 一人创业主体。本项目高度契合政策导向："));
children.push(...numList([
  "模式匹配：本项目为典型 OPC 一人 + AI 轻量化创业，不需要大规模线下厂房，依托软件与 AI 技术开展业务，符合征集对象定位；",
  "产业赛道匹配：项目属于人工智能应用 + 数字文化，是大鹏 OPC 先导区重点支持产业方向；",
  "创始人背景匹配：本科数据科学专业，具备建模、数据分析、AI 工具开发实战能力，拥有竞赛、职业项目成果；",
  "落地意愿明确：计划使用大鹏新区 OPC 集群注册地址，企业注册、税务、平台开发时间表清晰可落地；",
  "价值导向：项目把传统宗族、祭祀文化进行数字化保护与创新，符合数字文化产业发展方向；",
  "对 OPC 服务的诉求全部来自官方公开服务清单：集群注册地址、免租工位、算力支持、合规与政策申报培训、政务帮办服务。"
]));
children.push(P("入库之后，将积极参与新区创业培训、项目路演、产品展示活动，接受新区产业部门监督，严格按照核定经营范围经营，涉及互联网相关许可将及时办理。"));
children.push(brk());

// ===================== 第八部分 =====================
children.push(H1("第八部分　附件材料清单（扫描件粘贴页）"));
children.push(P("以下为初审所需附件，请逐页粘贴对应材料扫描件 / 复印件；标注“（可选）”项建议尽量提供以增强评审说服力。本页为占位页，提交前请替换为实际扫描件。", { run: { size: 18, color: "6B6456" } }));
const atts = [
  ["附件 1 ｜ 创始人身份证（正反面）扫描件", "姓名：陆苗苗　证件号：452223200210020024　（请粘贴正反面清晰扫描件）"],
  ["附件 2 ｜ 学历证明（毕业证）扫描件", "天津商业大学 数据科学与大数据技术 本科　毕业时间 2025-07"],
  ["附件 3 ｜ BDA 中级数据分析师证书扫描件", ""],
  ["附件 4 ｜ 数字技术工程师（人工智能平台产品实现）证书扫描件", ""],
  ["附件 5 ｜ 2023 全国大学生数学建模竞赛天津赛区二等奖 获奖证明", ""],
  ["附件 6 ｜ “宗忆堂” 第 45 类商标注册 / 受理证书", "（如已提交 42 / 35 / 9 类补充申请，建议一并附上受理回执）"],
  ["附件 7 ｜ 工作经历相关成果证明材料（可选）", "深圳汇银信用咨询有限公司 数据专员 任职 / 项目成果佐证"]
];
atts.forEach(([t, s]) => {
  children.push(new Paragraph({
    border: { top: { style: BorderStyle.DASHED, size: 6, color: "B9AD97" }, bottom: { style: BorderStyle.DASHED, size: 6, color: "B9AD97" }, left: { style: BorderStyle.DASHED, size: 6, color: "B9AD97" }, right: { style: BorderStyle.DASHED, size: 6, color: "B9AD97" } },
    spacing: { before: 120, after: 120 },
    children: [run(t, { bold: true, color: "403010" }), ...(s ? [run("　" + s, { size: 18, color: "8A5A20" })] : [])]
  }));
});
children.push(note("备注：初审通过后，需准备 5-10 分钟路演 PPT 用于项目评审答辩。"));
children.push(brk());

// ===================== 第九部分 =====================
children.push(H1("第九部分　提交前自查清单与合规特别提醒"));
children.push(H3("提交前自查清单"));
children.push(...checkList([
  "创业主体申请表全部信息完整，企业备选名称 3 个",
  "项目一页纸完成，清晰写清做什么、解决什么、进展、政策诉求",
  "创始人简历突出数据科学、AI、建模实战能力",
  "商业计划书五个模块完整",
  "注册和项目推进时间表明确",
  "政策匹配说明完整，突出 AI + 数字文化 + OPC 一人创业属性",
  "附件证书、商标、身份证明齐全",
  "全部内容导出为一个 PDF 文档",
  "在 2026-10-31 截止日前完成线上邮箱发送 / 线下窗口提交"
]));
children.push(H3("合规特别提醒"));
children.push(...numList([
  "本项目涉及网络人文缅怀、AI 语音克隆，后续要严格落实家属书面授权机制；",
  "一人有限责任公司必须公私账分开，按时年报，按监管办理互联网相关资质许可。"
]));
children.push(brk());

// ===================== 附录 =====================
children.push(H1("附录　提交与命名说明"));
children.push(...numList([
  "将本套资料（含封面、目录、第一至第九部分、附件粘贴页）整份导出为一个 PDF 文档；",
  "建议文件命名：宗忆堂-陆苗苗-大鹏新区OPC百企培育计划申请资料.pdf；",
  "邮件主题使用与文件名一致的标题，发送至大鹏新区 OPC 百企培育计划官方指定邮箱；",
  "第八部分附件页请替换为实际扫描件后再行提交；",
  "提交截止日期：2026-10-31（以官方最新通知为准）。"
]));
children.push(callout("如需进一步材料：", "可另行补充《路演 PPT 完整大纲》（5-10 分钟答辩用），以及 ICP / 互联网相关资质办理进度说明。"));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [run("—— 本材料依据申请人提供信息整理，仅供大鹏新区 OPC 百企培育计划申报使用 ——", { size: 18, color: "8A5A20" })] }));

// ===================== 文档 =====================
const doc = new Document({
  creator: "陆苗苗",
  title: "宗忆堂 · 大鹏新区 OPC 百企培育计划申请资料",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT, color: "403010" }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "D8B878", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: FONT, color: "5E352A" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: FONT, color: "6B4517" }, paragraph: { spacing: { before: 140, after: 80 }, outlineLevel: 2 } }
    ]
  },
  numbering,
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("宗忆堂 · 大鹏新区 OPC 百企培育计划申请资料 · 陆苗苗　　第 ", { size: 16, color: "B0A48C" }), run({ children: [PageNumber.CURRENT], size: 16, color: "B0A48C" }), run(" 页", { size: 16, color: "B0A48C" })] })] }) },
    children
  }]
});

const out = "宗忆堂-陆苗苗-大鹏新区OPC百企培育计划申请资料.docx";
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log("written:", out, buf.length); });
