# 项目约定（宗忆堂）

## 交付回复格式（重要，用户明确要求）

**每次完成修改后，回复里必须完整贴出以下信息块**，不要只给链接、也不要让用户往上翻：

```
平台地址：https://zongyimemorial.com
内测口令：neibu1234

管理员：admin@test.com / admin123456
普通用户：user@test.com / user123456
```

补充说明（可随附）：
- 旧地址 `zongyitang.lhr.rocks`（localhost.run 免费隧道）**已废弃失效**，勿再提供。
- 登录前置：先过「内测口令页」（口令 `neibu1234`），再到登录页。

## 已确认的产品决策

- **午夜悄悄话 TTS 路线：走云端**（不自建 CosyVoice）。
  因此「思念版」定价为 **¥59**（云端成本 ¥51，毛利 ≈14%）。
  若日后切自建（成本 ¥21），可回调 ¥39（毛利 ≈64%）。
  价格定义在 `lib/whisper.ts` 的 `PLAN_SPECS`，商品 seed 在 `prisma/seed-whispers.mjs`，两处需同步。

- **宗祠祭祀记录 + 纪念馆追思记录的身份展示：实名但脱敏（两处同口径）。**
  记录写入时**冻结快照**（`displayName` 脱敏、`realNameSnap`/`contactSnap` 完整）——
  用户日后补改实名**不会**回溯改写历史记录（防身份漂移，这是有意设计，勿"修复"）。
  因此测试时若想验证「管理台显示完整实名」，必须**先设 realName，再新建记录**。
  前台查询**只 select `displayName`**，绝不 select 快照字段、**也绝不 `include: { user }` 去读活实名**。
  脱敏规则集中在 `lib/mask.ts`，单元覆盖在 `scripts/verify-clan-tribute.mts`（27 项）。
  现金金额 `amountFen` 恒为 0，绝不从前端接收，从根上杜绝伪造入账。

  **纪念馆侧曾经漏做**（2026-09 补修）：`MemorialTribute` 原先没有快照字段，
  前台只能 `include: { user: { select: { realName } } }` 并原样渲染 →
  任何访客都能看到献祭者完整实名。现已补齐三列 + 历史回填，写入抽 `identitySnapshot()` 公共函数
  （免费/收费/留言三条路径共用）。
  两个易错点：① `displayName` 的 DB 默认值必须与 `lib/mask.ts` 的兜底文案一致（都用「匿名宗亲」），
  否则两端文案不一；② 回填的 SQL 必须用**字符语义**（`LEFT/RIGHT/CHAR_LENGTH`）而非字节的 `SUBSTRING`，
  否则多字节姓名会被切坏。验收 `scripts/verify-memorial-tribute-mask.mjs`（21 项）。

- **写"不包含 X"类断言时，必须做反向验证**（本次踩到的假绿风险）。
  `!html.includes(实名)` 这种断言在**页面没渲染出内容时也恒为 true** —— 看着通过，其实什么都没测。
  做法：临时把代码改回缺陷版本，确认断言**确实变红**，再还原。
  本次反向实验让 6 条断言同时变红（含核心那条报出 `出现「欧阳明华」`），才算证明断言有效。
  同类坑：别写 `indexOf(a) < indexOf(b)`（数据为空时 `-1 < N` 恒真）。

- **供奉面板只展示「我持有的」供品**（2026-09 定案）。
  免费祭器恒显示（进馆/祠即补足每日 3 份，用尽灰显、次日自动点亮）；
  收费祭器只在**持有过**时出现，用尽灰显、**重新购买即恢复点亮**。
  因此面板里**不会**再出现 `¥N` 解锁牌 —— 商城才是"逛"的地方。
  **`owned` 的口径是「`OfferingHolding` 里存在这一行」，不是 `quantity > 0`。**
  写成 `qty > 0` 会让"用尽"退化成"未购"，价格牌又冒出来（已踩过一次）。
  两页统一：`const heldIds = new Set(holdings.map(h => h.productId))` → `owned: heldIds.has(p.id)`。

- **宗祠页取收费礼器必须由 `OfferingHolding` 反查，不能开价格窗口。**
  旧写法 `orderBy pointsPrice asc, take: 4` 导致：用户花 800 积分买的数字烟花排不进前 4，
  **库里有货、面板里永远没入口**（静默丢功能）。这类"静默丢功能"最值得写回归断言。
  回归防护在 `scripts/verify-offering-panel.mjs` §4。

- **纪念馆/宗祠是「场景优先」布局**：首屏给遗像 + 供台，祭拜面板紧随其后。
  重排时**不能删板块、不能把断言的文字改成 SVG**（`堂号「」`/`当前陈设`/`字辈诗 · 派语`/
  `献祭 · 敬奉先祖`/`祭祀记录`/`每次 +2 积分`/`献上上香` 等 title / `text[data-altar-slug]` /
  `img[alt*='遗像']` 都是硬约束）。

- **遗像安奉（规格 = 正中 3×3 大龛）**：纪念馆上传了遗像就自动走壁龛墙（不必再选 `orn-niche-wall` 素材）；
  宗祠遗像在**牌位墙正中**的龛里（即香案正上方）。
  遗像一律是真实 `<img>` 叠加，**绝不画进 SVG**（要能按需加载、能被断言、letterbox 时不错位）。
  宗祠那处叠加依赖 `SHRINE_NICHE` 与 SVG `viewBox` 共用一份数字，改牌位坐标时必须同步改常量。
  **"放大 9 倍"= 占满连续 3×3 格（面积 ≈ 原单格 9 倍），不是把边长 ×9** ——
  字面按面积 ×9 在两端都几何不可能（壁龛墙上沿会冲出墙框，宗祠要在 340 高的墙上塞 800px）。
  纪念馆用 `nicheBlock(col,row,bw,bh,inset)`（`NICHE_PORTRAIT_BLOCK={cols:3,rows:3}`，
  slot `{col:3,row:0}`，`inset=0.06`）→ 约 248×181px；
  宗祠 `SHRINE_NICHE_KS` 扩到整间 `[0,1,2,3,4]`，`SHRINE_NICHE` 上起上横枋下沿、下抵趺座上沿 → 约 234×186px。
  **连带后果**：3×3 让位的 9 格不再绘制、改画一块 `nw-cell` 填充的大龛背板，
  所以 `verify-hall-niche.mjs` 里的"壁龛格数"从 45 变成 **45 − 9 + 1 = 37**（断言已改成该口径）；
  宗祠大龛的 SVG 块必须**画在立柱/斗拱之前**，否则建筑构件被龛盖住。
  `<img>` 的 `borderWidth` 设 0，描金边框由 SVG 那层提供（两处一致，勿双描边）。

- **空间装修体系（2026-10 定案）：建馆免费、升级付费、3D 走程序化。**
  完整说明见 `docs/空间装修体系.md`，这里只记最容易踩的几条。

  **档位四档**：`free`（仅建馆赠品及其零件）/ `points` / `buyout` / `premium`。
  `points` 与 `buyout` 的**区别只是"主推哪种支付"**，两种支付方式对用户都可用 ——
  所以工坊的兑换按钮对两者都亮（早先只对 `points` 亮，`buyout` 点下去得到
  「该素材无需兑换」，明明锁着却说不用兑换）。

  **3D = CSS `perspective/rotateY/translateZ` + 手绘 SVG，不是 WebGL/R3F。**
  决策记录在 `lib/decor-3d.ts` 文件头（隧道抖动 + 零外部资源原则）。
  `lib/decor-3d.ts` 管**空间形态**（表现层，不进库），`lib/hall-decor.ts` 管**装修内容**
  （数据层，进库），两者靠模板的 `space` 字段关联 —— 以后换 WebGL 只改前者。

  **赠品必须存 `decor.granted`，不能塞 `unlocked`。** `unlocked` 会被
  「恢复默认」与档位调整反复重写；`granted` 是承诺过的权益。
  两边 reset action 都要把 `granted` 原样带回。
  **赠品模板用到的零件随之永久免费（甲方案）**，登记在 `GRANTED_TEMPLATE_PARTS` ——
  漏一件，赠品渲染出来就是个半成品（曾经 `frame-gold` 是 `premium`，赠品的相框槽挂了锁）。
  验收用**集合相等**（免费集合 ≡ 赠品模板 id + 其零件）：
  数量口径太松（漏改一件也过）、太脆（加一套赠品就误报）。
  实测靠它抓出两件：`frame-gold`（少了）与 `clan-wall-white`（多了）。

  **发货三条路径必须落到同一个键**（`buy:` / `tpl:` / `kit:`）：商城付费、积分兑换、
  工坊内兑换。积分那条最容易漏 —— 漏了就是"扣了积分、写了兑换记录，但什么都没到手"。
  套件要**展开 `includes`**，只写 `kit:<id>` 会让用户看到"套件买了，里面的挂饰还锁着"。

  **首屏 3D 的判定优先级：付费模板 > 壁龛墙模式。** 别反转 ——
  用户花积分/钱买了星河，不该因为自己传过一张遗像就被降级回壁龛墙。
  同时要排除赠品模板（`tpl-niche` / `clan-tpl-ancestral` 的 space 都是非 classic），
  否则默认那套会把既有的壁龛墙/四段分镜首屏顶掉，老页面观感回归。

  **装修模块不得 import 供奉模块**（用户硬要求：免费馆与收费馆同一套供奉规则）。
  `scripts/verify-decor-3d.mjs` 扫描 8 个装修模块锁这条。

  **`Decor3DScene` 的 `containerW` 初值必须是确定值**（默认 920），
  不能由 `window.innerWidth` 推算 —— 服务端没有 window，水合首帧会 mismatch。
  挂载后由 `ResizeObserver` 校正。

  **模板名写了「立体」/「3D」，`space` 就不能是 `classic`。**
  反例真的发生过：`tpl-inkspace`、`tpl-longnight3d` 名字是「· 立体」、
  desc 写着"三面围合的静室""三盏素灯笼自檐垂下"，`space` 却误写 `classic`。
  错的**静默性**最要命 —— 照常能应用、照常渲染、不报错，只是永远不出 3D，
  用户感受是"我买了立体版怎么还是平面的"，商城详情页的预览也跟着哑掉。
  断言在 `verify-decor-3d.mjs` §3（`checkClaims3dHasSpace`），做过反向验证。

  **商城装修商品详情页要查两边模板表。** `decor-products.ts` 的 `resolveDecorEntitlement`
  只给出 id，不知道它属于纪念馆还是宗祠；渲染时要 `findTemplate(id) ?? findClanTemplate(id)`，
  只查一边会让宗祠模板商品页变成哑的（踩过）。预览的 `decor` 由**模板自己的 slots** 合成，
  商品页是公共页面，**不读任何人的馆、不出现任何逝者照片**。

  **装修改成"草稿 / 保存"模型（2026-10，用户原话「装修完了点保存即完成装修」）。**
  分界线是：**逛和试是草稿（本地 state），"买"是立即落库。**
  把"解锁"也做成草稿，用户就能"预览后关掉不保存"白得一套素材 —— 预览成了绕过支付的后门。
  所以点模板/换壁纸/换挂饰/应用套件 = 草稿；点「解锁」/积分兑换 = **立即写库**；
  「保存并完成装修」= 一次性原子写入；「放弃改动」= 退回上次保存快照、不写库。
  **保存不是"把草稿回放成 N 个 action"** —— 那会非原子（回放到第 3 件失败 → 库里半套混搭）、
  发 N 次请求（隧道 30–50% 会被边缘 503 打掉）、且 `templateId` 必须下在 slots 之前。
  现在前端把整份 `JSON.stringify({templateId, slots})` 塞一个 `draft` 字段，
  服务端在 `lib/decor-save.ts` 的 `checkHallDraft`/`checkClanDraft` 里**校验整份草稿**
  （客户端草稿可伪造，只校验"改了啥"等于把门禁交给前端），
  `saveDecor`/`saveClanDecor` 只覆盖 `templateId`/`slots`/`updatedAt`，
  **`unlocked` 与 `granted` 一律沿用库里的原值**。
  dirty 判定用**快照比较**（`contentKey(draft) !== contentKey(savedSnapshot)`），
  不用布尔位 —— 布尔位要 6+ 个改动点各自记得置位/复位，漏一处就是"改了但保存按钮不亮"。

  **草稿条只在 `dirty` 为真时渲染**，所以"把壁纸换回已保存那款"之后草稿条整条消失、
  「放弃改动」也找不到 —— 这是**正确行为不是 bug**（同上，断言要自己制造前提，见陷阱 11）。

  **指引体系三份、互链**：`/halls/guide`（建馆）⇄ `/clan/halls/guide`（建祠）⇄
  `/guide/decor`（装修）。页内步骤条 `CreateFlowSteps`（`data-create-flow`），
  装修工坊页内指引块 `DecorStudioGuide`（`data-decor-guide`），
  全屏预览 `DecorFullPreview`（`data-decor-fullpreview`，同时只挂一个 3D 实例，
  关时恢复 body.overflow 的**原值**而非硬写 `""`）。

- **阶段 3：素材扩充 / 四档定价 / 模板重排 / 典藏礼包（2026-10 定案）。**
  验收 `scripts/verify-decor-pricing-v2.mjs`（41 项，含反向验证）。

  **四档价格口径**：免费 ¥0 / 入门 ¥5–15 / 中档 ¥15–39 / 豪华 ¥39–99。
  新增模板与**新增**单件素材一律落在 ¥5–99；**存量老素材（¥1–4）刻意不动** ——
  集体提价会让老用户已买的权益在观感上"贬值"，且与"补中高档"这个目标无关。
  所以断言是三条而非一条：收费**模板**必须全在 ¥5–99；`premium` 档价格必须是 0
  （靠订阅生效，标价反而误导）；低价段只允许白名单里的存量 id。
  **别写"所有收费素材都在 ¥5–99"** —— 那会把 60 件存量素材全判红，一件问题都没有。

  **单调性断言的口径是「同 space 内比价格」，不是全局比。**
  `starfield` 本身就是 `none` 档（星河是"无建筑构件"形态），拿它跟 `hall/grand`
  比价格必假红；`pond` 也是 basic。所以按 `space` 分组、组内价格升序断言
  `structure` 单调不降。**别改成全局**。反向验证做法：把 `tpl-tangzhi`（¥99, hall/grand）
  临时降为 `basic` → 断言报出 `hall: clan-tpl-imperial(¥66,grand) → tpl-tangzhi(¥99,basic)`。

  **模板必须逐个声明 `space`，不留空回落 classic。**
  旧写法里 12 套老模板没写 `space`，全部退化成 classic（2 柱 + 1 枋）——
  它们价格 ¥6–20 属入门/中档，等于"花了钱跟没装修一样"。现已按档位补齐：
  入门 → `pond`/`classic`/`courtyard`，豪华（`tpl-goldhall`/`tpl-lotuswake`/`tpl-starry`）→ `hall`/`starfield`。
  `SPACE_DEFAULT_TIER` 是"该补几档"的依据，改动 `decor-3d.ts` 的 `SPACES[].structureTier`
  时**必须同步这张表**（它是手抄的，刻意不让数据层 import 表现层）。

  **礼包（bundle）是新的商品粒度，不是新的装修形态。**
  `DecorEntitlement.kind` 已扩到 `"kit"|"template"|"item"|"bundle"`。
  `listPriceFen`（原价）**由 `bundleListPrice()` 现算**，绝不手写 ——
  手写的"原价 ¥380"一旦与包内调价脱节就成了假广告。
  发货必须**逐件展开成 `tpl:`/`kit:`/`buy:` 键**（`ent.grants`），
  只写 `bundle:<id>` = "花了 ¥199 什么都没到手"，与套件早期那个坑同源。
  商城详情页要**列出包内清单 + 单买合计 + 省多少**（礼包卖的是差价，
  不列清单等于卖盲盒）。

  **礼包 slug 的坑：`shortId()` 必须先剥 `decor-`。**
  礼包 id 是 `decor-bundle-imperial`（**自带 `decor-` 前缀**），
  与模板 id `tpl-*` 的形态不同。只剥 `bundle-` 会得到
  `decor-bundle-decor-bundle-imperial`（三重前缀，实测踩到）。
  现在 `shortId()` 依次剥 `decor-` → `clan-` → `tpl-|kit-|bundle-`。
  `verify-decor-pricing-v2.mjs` §5 锁"原价与现算一致"，但**锁不住 slug 形态** ——
  这类"拼串"错误只有真去 seed 一次、再看 DB 才发现。

  **整店套餐（带 `applies` 含 wall/floor）的消费端在阶段 5 的工坊。**
  数据（`kit-imperial-hall` ¥59 / `kit-scholar-retreat` ¥22 / `clan-kit-ancestral-grand` ¥69）
  已就位，`applies` 目前**没有任何组件读**。别以为写了 `applies` 就自动生效 ——
  `onKit` 支持 `applies` 是 `DecorStudio` 的活。
  收尾判据：`applies` 的每个值都必须同时出现在该套件的 `includes` 里
  （否则"买了却没应用上"），断言在 §6。

- **遗像安奉：纪念馆与宗祠必须同规格（2026-10，用户问「这两个地方为什么不一样？」）。**
  查下来是**三层不统一**，全部已修，别只修一层就以为完事：

  **① 取值口径不同（最隐蔽）。** 宗祠早先是 `archive.portrait ?? hall.coverImage`，
  会把**封面建筑照当遗像供进龛里**；纪念馆只认 `archive.portrait`。
  现在两边统一：**遗像只认 `archive.portrait`**，封面图的归宿是页面顶部封面位。
  改口径后要留意 `SceneShrine` 的 `hasPortrait` 分支会跟着变。

  **② 观感规格不同。** 付费 3D 空间（`DecorSpacePreview`）里的遗像早先是裸 `<img>`，
  纪念馆 128×160、宗祠 120×150，**两个数字各自漂移且都没有龛体**。
  后果是"用户花钱升级后遗像待遇反而变差"——从墙面正中的大龛退化成浮在空中的小照片。
  现在统一走 `components/decor/PortraitNiche.tsx`：
  `PORTRAIT_W/H = 150×188` + 描金龛体 + 名讳签，**两个页面共用同一份常量**。
  场景高度也统一成 340（宗祠原为 320）。

  **③ 重复渲染（真 bug）。** 3D 空间与壁龛墙/牌位墙**曾可同时渲染遗像**
  → 同一页出现两张。纪念馆侧靠 `space==="niche"` 被 `isPaidSpace` 排除而**半遮半掩**
  （只在"有遗像 + 买了非壁龛模板"时暴露），宗祠侧 `SceneShrine` 更是**无条件渲染**。
  现在两边都显式互斥：纪念馆 `isNicheWall && !use3DScene`，
  宗祠 `portrait={has3DSpace ? undefined : portrait}`。

  `has3DSpace` 这种判定**必须与渲染分支同口径**（都从 `clanSpaceKind` 派生），
  否则会出现"一处渲染、另一处也渲染"或"两处都不渲染"的错位。
  验收 `scripts/verify-portrait-unify.mjs`（27 项，含反向验证）。

  **④ 宗祠调错了查表函数（真 bug，2026-10 修复）。** 宗祠公页一度写成
  `import { findTemplate } from "@/lib/hall-decor"` —— 那是**纪念馆的**模板表。
  于是 `findTemplate("clan-tpl-ancestral3d")` 永远 undefined
  → `clanSpaceKind` 恒 undefined → `has3DSpace` 恒假
  → **宗祠的付费 3D 空间从来不渲染**：用户花 1700 积分买了「牌位寝堂 · 立体」，
  在祠页上什么都看不到。
  正确用法：宗祠侧一律 `findClanTemplate`（`lib/clan-decor`）；
  若确实要两端都查，照商城详情页写 `findTemplate(id) ?? findClanTemplate(id)`
  —— 见上面那条"商城装修商品详情页要查两边模板表"，**同源问题**。

  这个 bug 的静默性最要命：不报错、不警告、页面照常（走回落分支），
  只是"付费升级"这件事在宗祠侧根本不存在。
  TypeScript 也抓不到（两个函数签名兼容）。
  断言在 `verify-portrait-unify.mjs` §①（源码层 3 条）+ §⑤（运行时真渲染，3 条），
  已做反向验证：改回 `findTemplate` 后 **6 条同时变红**。

  > 排查这个 bug 时踩的坑：用 psql 复现"有遗像 + 付费模板"时**只写了 templateId、
  > 忘了写 `unlocked`** → `normalizeClanDecor` 把未持有的模板 id 静默丢弃
  > → 页面照旧不渲染 3D，看起来像"改了没用"，其实是自己没造对前提
  > （该行为本身是正确设计：防"没买却一直用"）。

  > 反向验证踩的两个坑（都像功能坏了，其实是**身份/权限前提不对**）：
  > 选中的常是 `verify-clan-e2e` 刚建的祠，它 `status=pending` ——
  > ① 匿名访客看到的是"仅你可见"分支，场景不渲染；
  > ② **管理员也打不开（404）**，pending 祠只对馆主本人可见。
  > 正确做法：用 `user@test.com`（这批祠的馆主）登录，且**只挑 `active` 的祠**。
  > 断言里要先探测"当前身份能打开目标页"再往下走，否则后面全是 0 张、白测。

  **⑤ 装修画廊手拼商品 slug，宗祠 18 套全部死链（真 bug，2026-10 修复）。**
  `/gallery/decor` 的 `mallHref` 手写成 `decor-clan-${t.id}`，但 `CLAN_TEMPLATES`
  的 id **本身就以 `clan-` 开头**（`clan-tpl-plain`）→ 撞成
  **`decor-clan-clan-tpl-plain`（双 `clan-`）**，而库里是 `decor-clan-tpl-plain`
  → 18 套宗祠主题点进去全是 not-found。
  另 2 套 free 档赠品（`tpl-niche` / `clan-tpl-ancestral`）**库里根本没有商品**
  （建馆/建祠自动赠送，设计上不售卖），也被渲染成可点卡片 → 死链。

  修法与根因：`lib/decor-suites.ts` 的 **`suiteItemSlug(ref, kind)`** 才是
  **唯一权威**的 slug 生成器（剥离 `clan-` 与 `tpl-/kit-/bundle-` 前缀后重组，
  与 `prisma/seed-decor.mts` 的 `shortId` 同口径）。
  画廊改为**复用它**，删除手写逻辑 —— 这是本仓第 N 次「同一事实两个判据」的事故。
  free 档卡片改为**不可点击 + 标注「建馆/建祠赠送」**。
  验收 `verify-decor-suites.mjs` §7（5 条，含"无 `decor-clan-clan-` 双前缀"反向断言）。

  > ⚠️ 排查这次 bug 的最大教训**不在产品代码，而在验证方法**：
  > 我写的探针**自己拼 slug** 去比对数据库，结果页面改不改都显示同样的"43 套全挂"
  > —— 验的是我的假设，不是页面行为。后又用 `/404|page could not be found/`
  > 正则判定（Next.js 把这个兜底模板字符串嵌在 hydration 脚本里，**正常页也含**），
  > 得了个假报告白查半天。**验收必须从页面真实产物取数** ——
  > 详见「跑验证套件的几个坑」§1。

- **阶段 4：全页联动换肤（2026-10 定案）。**
  验收 `scripts/verify-decor-skin.mjs`（63 项，含反向验证）。
  目标一句话：**"装修过"与"没装修过"要肉眼一眼分得出**（否则用户没有装修动机）。
  做法是**不改 DOM、只注入 CSS 变量** —— 公页是 Server Component，
  用 React Context 会把整页拖进客户端 bundle；CSS 变量天然级联，
  且值是内联 style 字符串、不依赖 `window`，所以**没有 SSR 水合 mismatch**。
  既有的 23 套断言依赖的 class（卡片标题 / `overflow-hidden` / `p-3`）**一字未动**。

  **三层合并顺序**：`DEFAULT_SKIN → 槽位素材 skin（wall→floor→ornament→frame→font）→ 模板 skin`，
  **模板最后拍板**（换模板必须能压掉素材带的皮肤）。

  **中间加了 `mood` 一层，这是本阶段最重要的结构决定。**
  `id ──(MOOD_RULES / MOOD_OVERRIDE)──▶ mood ──(MOOD_SKIN)──▶ token`。
  mood 共 7 档：`plain | muted | earth | wood | vermilion | imperial | night`。
  理由：素材/模板有 168 个 id，**让每个 id 各自写一份 token 一定会漂**；
  收敛到 7 份调色板后，"整体调色"只改 7 处。
  规则表按数组顺序取**首个命中** —— 所以**模板规则必须排在通用素材规则之前**
  （`tpl-*` 与素材可能共享关键词）。
  `MOOD_RANK = { plain:0, muted:1, earth:1, wood:2, vermilion:3, night:3, imperial:4 }`，
  多层合并时**取 max 而不是首个命中**（贵的那层说了算）。
  `MOOD_OVERRIDE` 是"规则表猜不出/猜错"的逐件点明，
  典型是 `tpl-plain` / `clan-tpl-plain` → `plain`：
  它名字里就有 `plain`，会被 muted 规则（关键词表含 `plain`）抢走 →
  免费档会显示淡描金分隔线 → "免费 vs 入门"的落差当场消失。
  **这类"故意越过规则表的例外"必须写在 override 里，别去动规则表**。

  **覆盖率必须变成断言，不能靠肉眼。** 重写过程中 dump 168 个真实 id 一跑，
  发现 `tpl-tangzhi`/`tpl-mistveil`/`tpl-bambooherm`/`tpl-qinggong`/`tpl-shuhua` 等
  **一批模板谁都匹配不上、静默落回默认色**（照常渲染、不报错、只是没换肤）。
  现在 §2 断言两件事：① 落 `plain` 的 id 必须命中 `PLAIN_OK` 白名单；
  ② **`plain` 占比 ≤ 45%** —— 否则把新漏的 id 挨个塞进白名单就能"修好"，
  白名单会退化成垃圾桶。实测 62/168 = 36.9%，覆盖率 100%。

  **⚠️ 本阶段抓到的真 bug（截图 `.shots/stage4-clan.png` 发现）：宗祠页「字辈诗 · 派语」白字压浅米卡，几乎看不见。**
  根因是**判定源分叉**：
  - 文字色用**并集判定**（`clan-wall-brick` 在旧列表 `CLAN_DARK_WALLS` 里 → 判深底 → 出浅字）；
  - 卡片底色用 **skin 判定**（`brick` 在新 mood 规则里是 `earth`，非深色 → 出浅米底纹）。

  两个判据在**边界素材**上必然打架。修法是新增 `withDark(skin, effectiveDark)`，
  把并集判定**回写进 skin**（深色档：`dark:true`、gilt 兜底 `#d4af37`、
  `titleWeight` 抬到 ≥600、`shadow` 抬到 ≥0.5、
  **`cardTexture: null`** ← 深底上必须去掉浅色底纹、换上深色分隔渐变）。
  这样**"文字色"与"卡片底色"来自同一个判据**，结构上不可能再打架。
  两层（`HallDecorLayer` / `ClanDecorLayer`）新增可选 `skin` prop 供页面传入，
  两页统一 `const pageSkin = withDark(skin, dark)` → `<XDecorLayer skin={pageSkin}>`。
  运行时可证：正确版 `--skin-dark: 1` + `cardTexture: none` + 正文 `rgba(255,255,255,0.9)`；
  缺陷版 `--skin-dark: 0` + 浅米渐变 + 白字。
  **`--skin-dark` 刻意用 `0/1` 而非 `"true"/"false"`** —— 它要能进 `calc()` / `color-mix()` 做数学。

  **描金边框分级靠 `color-mix` 而不是"有/无"：**
  `color-mix(in srgb, var(--skin-gilt) calc(var(--skin-shadow-strength) * 100%), var(--skin-secondary))`。
  这样素白档 gilt 是 `transparent` 时**混出来是灰边框、不会整个消失**（消失=布局塌）。
  同理 `skinDividerStyle()` **固定给一条素色 fallback 底线**，别指望 gilt。
  标题下划线用 `backgroundImage` 而不是 `border-bottom`（零布局影响）。

  **本套件自身踩的三个坑（都不是产品问题，记下来省下次）：**
  1. **`priceFen` 是"分"，当"元"用** → 41 套模板全落"豪华档"，
     断言报「0/0」看着像"没有豪华模板"。修法：`(t.priceFen ?? 0) / 100`。
  2. **探针按"有 `templateId`"挑"已装修馆"** → 挑到 `tpl-niche`
     （槽位全是占位项、皮肤本就不该激活），报"已装修馆 `data-skin` 应为 on 却失败"。
     修法：**用产品同一套判据** `skinIsActive(skinOf(...))` 去筛样本 ——
     **测业务规则时别在测试里重写一份口径**，否则测的是测试自己的理解。
  3. **对比度断言只读 `backgroundColor` 假红、只读 `background-image` 假绿**。
     第一版把深色卡的半透明白 `rgba(255,255,255,.1)` 当成"白色"→ 把**正确**的深色卡判成浅底；
     改成读渐变后又忽略了缺陷版的浅米渐变 → 假绿。
     最终：`background-color` 与 `background-image` **两层都算**，
     `textureLum()` 解析渐变里的色标取均值，半透明层**沿祖先链合成到屏幕实际颜色**。
     修后正确版 Δ=0.39 PASS、缺陷版 Δ=0.07 FAIL。
     教训通用：**验"视觉是否有区别"要验渲染出来的像素，别验某个 CSS 属性名**。

  **断言别写得比规则更具体**（本次把 `verify-decor-scene-engine` 跑红 2 条的真因，
  两条都是断言太窄、不是产品坏了）：
  - 「不 import React」把合法的 `import type { CSSProperties }` 判成架构违规。
    **类型专用导入编译期会被擦除**，不违反分层约束。
    修法：只查**运行时值导入**（`import` 语句里排除 `import type`）。
  - 「`skinOf` 合并顺序」用逐字正则把变量名 `explicit` 锁死，重命名即误报。
    修法：**只锁顺序**（`slotIdx < tplIdx` 且 `/out = \{ \.\.\.out,/` 命中模板块）。
    静态断言只保证"谁在谁之后"，别锁中间变量名。

  **六轮反向验证**（全部记录在 `verify-decor-skin.mjs` 头部）：
  ① `imperial.gilt`→`transparent` → 变红 ✅；
  ② 删夜/星规则 → 覆盖率断红并**点名 7 个 id** ✅；
  ③ 去掉 `skinVars` 注入 → 变红 ✅；
  ④ 深色判定改直接替换（不 `withDark`）→ 变红 ✅；
  ⑤ 删 `tpl-tangzhi` override → **没变红** —— 查明它已被规则表兜住，
     该 override 是冗余（**这是有效信息，不是断言失效**）✅；
  ⑥ 祠页 `skin={pageSkin}` → `skin={skin}` → **62/63**（§6 + §8 双红）✅。

  **⚠️ 同一个"判定源分叉"错误在本阶段出现了两次，第二次是收尾复查才发现的。**
  第一次就是上面那个 `withDark`；第二次在 **`data-page-skin` 标记**上：
  渲染层拿的是 `pageSkin`（回写过），标记却拿原始 `skin` ——
  于是"深色墙 + 没买皮肤"的页面**已被深色皮肤接管**（`--skin-dark: 1`、gilt `#d4af37`），
  属性却报 `off`。**标记在撒谎**，下游任何 CSS 选择器 / 断言都会拿到错值。
  一个探针就能钉死它：
  ```
  原始 skin 是否激活 : false      回写后 : true
  原始 --skin-dark : 0            回写后 : 1   gilt: #d4af37
  ```
  修法与 `withDark` 同源：**让标记跟着实际渲染走**（`skinIsActive(pageSkin)`）。
  新增两条断言：源码层锁 `data-page-skin={skinIsActive(pageSkin)`；
  **行为层**直接读页面实际输出的 `data-skin` 与 `--skin-gilt`，
  断言 `data-skin=on ⟺ gilt 非 transparent`（两个信号必须一致）。
  反向验证：注回缺陷版 → **57/58 精确变红**，点名「祠页 data-page-skin 用 pageSkin」。
  收在 `verify-decor-skin.mjs` §8 的 ⑩ 条，脚本总数 63 → **66**。

  > 教训（值得单独记）：**"同一个事实有两个判据"是个会复发的病**，
  > 修完 A 处要去搜 B 处 —— `grep -rn "skinIsActive\|(skin)"` 把所有判据列出来，
  > 逐个问"它跟真正渲染的那份是同口径吗"。本次共 4 处调用，一处错。
  > 更通用的说法：**要传播的是"已经回写过的那份"，不是"最初算出来那份"**。

  **一处刻意的边界**：整店套餐（`applies` 含 wall/floor）的**消费端不在本阶段**，
  划给阶段 5 工坊。数据已就位但"写了 `applies` 就自动生效"是错觉。

- **阶段 5：套件升级 + 工坊重做 + 礼包（2026-10 定案）。**
  验收 `scripts/verify-decor-studio-v3.mjs`（28 项，含反向验证）。

  **① 整店套餐的消费端落地，且保留 `templateId`。**
  分界线是 `isFullStoreKit(kit)`（`applies` 含 `wall` 或 `floor`）：
  普通套件置空 `templateId`（改回"自定义搭配"），**整店套餐保留**。
  用户花 ¥59 买「金殿整装包」，若跟着置空，空间骨架会退回 `classic`（2 柱 1 枋）
  —— **越买越朴素**。它换的是墙/地/陈设，不是建筑骨架，骨架另有模板管。
  **判 `applies` 而不是判 `priceFen`** —— 价格会调，形态不会。

  **`kitSlots()` 必须 applies 优先、前缀推断只兜底。** 反过来是"碰巧推对"
  （三个套餐命名规范）—— 正确性挂在"素材 id 命名规范"这个约定上，坏起来静默。

  **② ⚠️ 断言的期望值不能由被测逻辑自己产出（"自产自销"假绿，本阶段新踩）。**
  组件把套件声明渲染成 `data-kit-slots` 供脚本断言，最初写成
  `JSON.stringify(kitSlots(kit))` —— 而 `kitSlots()` 正是被验收的逻辑。
  缺陷版下"实际应用"错、"声明"也错，**两边自洽 → 28/28 全绿**。
  修法：**直接取数据层原值** `kit.applies ?? kitSlots(kit)`（兜底结果不用于断言）。
  规矩：**期望值必须来自独立于被测逻辑的真相**，被测逻辑的产物只作为"实际行为"被比对。
  这与"别在测试里重写一份口径"是一体两面。

  **③ ⚠️ 反向验证"测不出来"是常态，要造分叉。**
  只注释掉 `kitSlots` 的 applies 分支测不出差异 —— 因为三个套餐的
  includes 与 applies **恰好同值**。必须同时把 `applies.floor` 改成
  `includes` 之外的真实素材（`floor-wood` → `floor-marble-veined`），
  两条路径结果才分叉，断言才变红（报 `地纹 显示「金丝楠木」(floor-wood)
  ≠ applies 的 floor-marble-veined`）。
  **判据：断言变红的前提是"缺陷版与正确版的输出真的不同"**，
  否则你只是在验证"两段一样的代码算出一样的结果"。

  **④ `priceFen` 单位坑在同一组件里踩了两次。** `priceFen` 是分、`priceYuan()` 是元。
  ① 判"当前档"手写 `curPrice < 1500`（元比分）→ ¥99 恒落"入门档"；
  ② 修了 ① 之后**统计各档套数那处没改**（`y >= d.min` 元比分）→
  "可选套数"长期 `entry:0 mid:0 lux:0`，而当时 v3 的三条阶梯断言全绿，
  它是**从断言网眼里漏过去的**。
  现在 `TIER_BANDS` 的 `min/max` 统一用元，且 `range` 文案与 `min/max` 严格一致。

  **⑤ 阶梯用价格档而非结构档。** `starfield` 的 `structureTier` 是 `none`
  （"星河"是"无建筑构件"形态），拿结构档当"档次"会把最贵的「星河长明」
  算成最朴素。结构档衡量"画了多少建筑构件"，用户理解的"档次"是"花了多少钱"。

  **⑥ 断言用"合计守恒"而不是"某档 > 0"。**
  §4 断言 **各档可选套数之和 = 模板总数**（实测 `[1,10,11,3]` 合计 25）。
  合计守恒对单位错/边界漏/区间重叠/区间有缝**全都敏感**；
  "每档 > 0"测不出边界写错。另加一条"至少有一档非 0"堵 `0 === 0` 的假绿。

  **⑦ "变了"是弱断言，要断"变成了什么"。** 阶梯的当前档断言原为 `cur0 !== cur1`，
  正是它让 ④ 的单位 bug 蒙混过关（bug 版点 ¥99 得 `entry`，与 `free` 比"确实变了"）。
  现在断 `cur1 === "lux"`。**"变了"只守得住"接没接上"，守不住"接对了没有"。**

  **⑧ 整页预览 = `DecorPagePreview`，与公页同口径。**
  复用 `HallDecorLayer` 与 `lib/decor-skin.ts` 的四个 helper，**不内联重写**
  （重写必然漂移成"预览好看、公页难看"）。
  skin 必须传 **`withDark` 回写过的那份**（`previewSkin`），`darkDecor` 由控制台页传入。
  三个细节：不含 3D 场景（会污染 `[data-decor-3d]` 计数）；容器加
  `transform: translateZ(0)` + `contain: paint`（否则后代 `fixed` 飞出去）；
  不出现逝者照片。

  **⑨ 测 UI 时"读不到"往往是"没切过去"。** 读素材卡的
  `data-decor-item-id` 要先切到该槽位分类（素材卡只渲染当前分类）；
  分类按钮文案是「背景壁纸 / 地面地纹 / …」**不是**槽位名"壁纸"，
  用错词点不中 → 映射全空、断言报"未识别"（本轮踩到，同陷阱 12）。
  另外素材名要取 `[data-decor-item-name]`，
  不能拿卡片 `innerText` 第一行（那是「◻素白¥1 · 已解锁使用中纯净留白…」一长串）。

- **阶段 6：公页切换 v2（2026-10 定案）。**
  验收 `scripts/verify-decor-public-v2.mjs`（29 项，含三组反向验证）。

  **切法用「显式传参」而非改默认值。** 三处公页（馆页 / 祠页 / 商城装修商品详情页）
  各自写 `engine="v2"`，`DecorSpacePreview` 的默认值**仍是 v1**。
  理由：默认值保留成"回退开关"——出问题改调用处一处即可单独回退某页；
  改默认值会让"没传"变成"悄悄用上 v2"，回退时得到处找。
  原哨兵断言（`verify-decor-scene-engine.mjs` §6，防"悄悄提前切"）**翻面**为
  正面断言（三处都必须显式传），并**点名漏切的那页** —— 翻面不是放宽，
  是把监控点从"别提前切"推进到"必须切齐"。

  **⚠️ 库里默认没有任何馆/祠配了付费空间模板（全库 0 行），
  所以"不造前提直接测"必然全绿而什么都没测。** 公页 3D 有门禁：
  馆页 `use3DScene` / 祠页 `has3DSpace` 都要求**付费**模板（赠品 `tpl-niche`、
  `clan-tpl-ancestral` 被显式排除）。新套件开局用 psql 造前提
  （挂 `tpl-goldhall` / `clan-tpl-imperial` + 写 `unlocked`），
  `finally` 按**备份逐字还原**。
  > 连带发现：既有的 `verify-mobile.mjs` ③/④ 两条 `clipped()` 断言同样依赖这个前提 ——
  > 阶段 6 实跑时先单独验过一次，那时库里 0 个场景，`clipped()` 报绿其实是
  > "页面没渲染任何 3D"的假绿。造了前提之后连跑三次仍 29/29，才算真绿。

  **还原判据必须是「与备份逐字相同」，不能写「不等于实验值」。**
  第一版 `back !== "clan-tpl-imperial"` 立刻假红：样本祠原本（手工造的前提残留）
  `templateId` 就是它 → 还原成功但值没变 → 误报"没还原"。
  与阶段 5「变了是弱断言」同源：**"变了"守不住"变对了没有"**。

  **遗像尺寸断言要有前提。** 实测**全库没有任何宗祠有遗像**，
  于是祠侧那两条会常年走 SKIP、永远不被覆盖（"常年 SKIP 的断言"≈没有断言）。
  修法是 §0 借一张纪念馆已有的图片路径挂到样本祠上（同机同 uploads 目录），
  触发渲染，收尾随 archive 一起还原。现在祠侧能读到真实的 `150×188`。

  **⚠️ 「标记不得撒谎」那条一致性断言（`(data-engine==="v2") === hasStructureLayer`）
  不能单独用。** 反向实验 A（三处去掉 engine）里 v1/v1 两边自洽 → 它照样 PASS。
  它守的是"切了之后标记与渲染同口径"，**守不住"有没有切"** ——
  必须与「`engine === "v2"`」配对，两者缺一不可。
  反向实验 C（`data-engine` 硬写 `"v2"` 但两页实际走 v1）证明它有效：
  **8 条变红**并点名 `engine=v2 structure=false`；同轮商城页（真 v2）仍 PASS，
  说明断言**有区分度**、不是"一律报红"。

  **`DecorSpacePreview` 的两端模板表兜底链目前只有源码级覆盖。**
  它自称"纪念馆/宗祠通用"，早先只 `findTemplate`（纪念馆表）→
  宗祠模板会静默落回 `classic`（不报错、页面照常，只是"买的御赐宗祠看起来没装修"）。
  现已改为 `findTemplate(id) ?? findClanTemplate(id)`。
  但**三处调用方都传了 `spaceKind`**，把组件内部查表绕开了 →
  反向实验 B（改回单表）**行为级全绿、仅源码断言变红**。
  这是"缺陷目前不可观测"而非"断言无效"，注释里已如实标注。
  保留理由是防未来不传 `spaceKind` 的新调用方翻车 ——
  与 AGENTS.md 记的 `findTemplate` 误用真 bug 同源。

  **`verify-mobile.mjs` 的覆盖范围要留个心眼**：它挑的馆/祠是从控制台里
  正则抓的第一个 id，**不保证有 3D 场景**。所以它的 `clipped()` 绿不绿
  取决于当前数据，测 v2 三页请以 `verify-decor-public-v2.mjs` 为准。

- **高级订阅判定已统一到 `lib/premium.ts`（2026-10 修复「宗祠装修后无法保存」）。**

  **用户报的症状**：宗祠里挑好模板 → 点「保存并完成装修」→ **毫无反应**。

  **根因不是保存逻辑，而是"同一个事实有两个判据"**（本仓库第 N 次踩这个病）：

  | | 取源 | 后果 |
  |---|---|---|
  | 宗祠控制台页 `page.tsx` | 馆级 **OR** 用户级 | 用户级订阅有效 → UI 显示「高级订阅生效中 · 全部装修素材可用」 |
  | `saveClanDecor` 的 `isPremiumOf(hall)` | **只认馆级** | 同一用户被判「尚未解锁」→ 保存驳回 |

  用户级订阅有效、馆级为 null 时，这一格必然打架 ——
  **UI 说能用，服务端说不能买**，而报错文案又没显眼到让人看懂，
  观感就是"点了保存没反应"。

  **排查关键**：`premiumUntil` 存在于 **User / MemorialHall / ClanHall 三个模型**上。
  只查馆级会漏掉用户级订阅（`lib/pay.ts` 买订阅时写的是 **user 级**！）。
  一张 psql 就能钉死：
  ```sql
  SELECT c."premiumUntil", u."premiumUntil" FROM "ClanHall" c
    JOIN "User" u ON u.id = c."ownerUserId" WHERE c.id = '<id>';
  -- 馆级 NULL + 用户级有值 = 就是这个 bug 的前提
  ```

  **`lib/premium.ts` 曾经是死代码** —— 文件头写着"唯一实现，新代码一律引用它"，
  但**一个 import 都没有**，各处共 17 处手写判定已分叉成**三种语义**
  （仅馆级 / 仅用户级 / 并集）。已全部收敛：现在全仓
  `grep -rn 'premiumUntil && new Date('` **零命中**（只剩 premium.ts 里的注释）。

  **口径已定：馆级 OR 用户级**（用户买的订阅覆盖他名下所有馆/祠）。
  新代码用 `isPremiumForUser(user, hall)`（并集）或 `isPremiumUntil(x)`（单来源原语）。
  **别再用 `isPremium(obj)` 装并集** —— 它是单来源判定，名字太像会误用。

  `isPremiumOf` 的**参数已从 `hall` 改成 `ctx`**：
  这样调用处**无法"只传馆"而悄悄退回旧语义**（TypeScript 直接拦下）。

  验收 `scripts/verify-premium-unify.mjs`（10 项，含反向验证）：
  §1 源码层（premium.ts 被真正引用 + 并集写法）、§2 源码层（无手写残留）、
  §3 **造前提**（馆级 NULL + 用户级在未来 —— 不造这格，整个脚本会全绿而什么都没测）、
  §4 行为层（真点素材 → 真点保存 → 库里 `updatedAt` 必须变）、§5 还原。

  > ⚠️ **本脚本会改数据，必须连 `templateConfig` 一起还原**（已踩一次）。
  > §4 要验"保存成功"就得真保存一次装修 → 改掉样本祠的 `templateConfig`。
  > 最初只还原 `premiumUntil`，结果把兄弟套件 `verify-portrait-unify` 跑红：
  > 它对**同一座祠**断言"实验后 `templateId` 应为空"，
  > 而这边留下的 `clan-tpl-plain` 让它报 `(clan-tpl-plain)`。
  > **看着像那边坏了，其实是这边没打扫。**
  > 两处已同时修：本脚本备份+还原 `templateConfig`；
  > `verify-portrait-unify` 的判据从 `back === ""` 改成
  > **`back === 备份里的 templateId`** —— 写死空串等于假设了"原始值就是空"，
  > 换个数据就假红（与阶段 6「还原判据要等于备份」同源，**第三次**踩）。

  **反向验证**：把 `isPremiumOf` 改回只认馆级 → **精确变红 3 条**，
  其中 `点保存后库里 updatedAt 真的被改写` 报 `before === after`
  （正是用户看到的"没反应"）。同轮 `控制台页认出高级订阅` **仍 PASS** ——
  证明**页面侧一直是对的、只有 action 错**，这就是"分叉"的直接证据。

  > 教训（与 `withDark` / `data-page-skin` 同源，这是第三次）：
  > **"同一个事实有两个判据"是个会复发的病。** 修完一处要去搜第二处 ——
  > `grep -rn 'premiumUntil'` 把所有判据点列出来，逐个问
  > "它跟真正生效的那份是同口径吗"。本次共 17 处，3 种语义。
  > 更通用的判据：**收敛成一个函数还不够，得让调用处"想错也错不了"**
  > —— 把参数从 `hall` 换成 `ctx`，比写十行注释"请记得用并集"管用。

- **存储空间容量体系（2026-10）：免费额度 + 按年升级，与 premium 彻底解耦。**
  完整说明见 `docs/存储容量与定价.md`，这里只记最容易踩的几条。
  验收 `scripts/verify-storage.mts`（68 项，含反向验证）。

  **口径**：免费额度 馆 1GB / 祠 2GB（建馆/建祠即赠，永久）；容量包按年订阅
  （4 档 ¥29/¥99/¥299/¥599，对应 10/50/200/500GB）。**到期回退免费额度、已存资料不删、
  仅限制新上传**（与装修租期 #224 同构）。
  **定价推导**：云存储裸成本中位 0.10 元/GB/月 = 1.20/GB/年；低/中档毛利 39–59%；
  封顶 500GB 避免"卖 1TB 必亏"的裸成本倒挂。

  **单一判据 `lib/storage.ts` 的 `effectiveStorageQuota(hall, kind)`** —— 只读 hall 自身字段，
  **绝不读 premium**。上传接口 / 控制台面板 / 回退全部调它，杜绝"面板说还有空间、上传却被拦"。
  `premium` 仅保留「单张 20MB 高清原片」权限，不再决定容量。

  **⚠️ 字节列必须是 `BigInt`，用 `Int` 是静默炸弹。**
  500GB = 536,870,912,000 字节，远超 `Int` 上限 2,147,483,647 ——
  实测写 50GB=53,687,091,200 直接 `integer out of range`。
  用 Int 会让 200GB/500GB **两档根本存不进去**（定价表能建、履约即崩）。
  连带三处：① Prisma 写入的 `increment`/`decrement` 值必须传 `BigInt(n)`；
  ② `lib/storage.ts` 内部统一 `toNum()`（接受 `number|bigint`），别让调用处到处 `Number()`；
  ③ 控制台页把 `bigint` 传给客户端组件前要 `Number(...)`。
  这是**真 bug，被 verify-storage 的 §3 行为层抓出**（单测只判值域、不碰 DB，抓不到）。

  **⚠️ 服务端组件不能把闭包传给客户端组件。**
  `StoragePanel` 的升级按钮要调 `"use server"` action 建单。最初写成
  `createOrder={(slug) => createStorageOrder(hall.id, slug)}` —— 运行时
  `Functions cannot be passed directly to Client Components`，整个控制台页崩成
  「页面加载遇到问题」。正确做法：**传 action 引用本身** + 另传 `hallId`，
  由客户端 `createOrder(hallId, slug)`。报错只在服务器日志（`/tmp/next.log`），
  页面上只看到白屏重连提示 —— 排查时先看 `tail /tmp/next.log`。

  **容量包是「指定某一座馆」的**，故 `Order` 加 `targetHallId`/`targetKind`，
  下单时才填、履约时据此回写 `storageSubBytes`/`storageUntil`（与 decor 分支同构）。
  `createOrder` 内做**归属校验**（`ownerUserId === userId`），防"拿别人的馆 id 下单把容量充进他人的馆"。
  升级入口因此放在**控制台面板**（Server Action 一步建单），不在商城公共商品页
  （公共页可能未登录、也可能多个馆，无法确定目标馆）。

  **旧 `premium-storage` 订阅商品已下架**（2026-10，`status = inactive`）。
  它曾是"¥99/年 · 50GB"，与容量包 `storage-50g`（¥99/年 · 50GB）**同价同容量并列
  在商城里** —— 用户无法二选一，且一个能积分兑（9900）、一个不能（价格歧视）。
  根因是它属于"premium 时代"：容量由 `premiumUntil` 隐式推导，是 `lib/storage.ts`
  之外的第二判据。**履约分支仍保留**（存量已购订单不能因下架而失效）。
  完整原委见 `docs/存储容量与定价.md` §6.5。

  **单张 20MB 高清原片权限已并入容量包**（2026-10，全档位）。
  判据是 `lib/storage.ts` 的 `hasHdUpload(hall) = isStorageActive(hall) || premiumUntil 有效`。
  保留 premium 一支是为了**不剥夺存量已购用户的权益**（库里有 2 个馆带有效 `premiumUntil`）。
  ⚠️ 曾经两个上传 route 各自手写 `isPremium ? MAX_BYTES_PREMIUM : MAX_BYTES_FREE` ——
  于是"花 ¥599 买 500GB，传一张 12MB 原片被拒，拒因还写'升级高级订阅'（那个只有 50GB）"。
  现在统一走 `maxImageBytes(hall)`，字节常量也只在 `lib/storage.ts` 定义
  （`lib/upload.ts` 的旧名 `MAX_BYTES_FREE`/`MAX_BYTES_PREMIUM` 只是别名转出）。
  `HallPhotoManager` 的 `isPremium` prop **已改名 `hdUpload`** —— 沿用旧名会让调用方
  漏掉容量包这条来源。

  **回填必须先跑**：`prisma/backfill-storage-used.mjs`（按磁盘 `fs.stat` 累加 `archive.photos`，
  只算本系统托管图片、外链不计；**覆盖写**故幂等）。不跑的话老馆"已用"从 0 起算，
  一上传就可能被判"满"。

  **⚠️ 断言自己也会假绿。** `verify-storage.mts` §3.5「商城无同价同容量重复存储商品」
  最初只从**商品名**正则抽容量，而 `premium-storage` 名字里没写容量（"纪念馆大容量存储"），
  被算成 `9900/-1`，与 `storage-50g` 的 `9900/50` 不同组 → **恒绿**。
  做反向验证（把它改回 active）时才暴露。修法：容量来源取两处 ——
  商品名里的 + `pay.ts` 里刻的历史档位映射。**反向验证是唯一能发现假绿的手段，不能省。**

- **一键分享与传播（2026-10 定案）。**
  验收 `scripts/verify-share.mjs`（67 项，含四组反向验证）。

  **范围**：文章详情页 `/news/[slug]` + 纪念馆公页 `/halls/[id]` + 宗祠公页
  `/clan/halls/[id]`。三页各挂 `components/share/ShareBar.tsx`。

  **分渠道策略——国内社交平台的现实约束**：
  微信/头条**没有官方 Web 分享接口**。所以：
  - **手机端** → `navigator.share()` 唤起系统面板（微信、头条、QQ 都在里面），
    这是唯一能真正"分享进微信"的 Web 能力；
  - **桌面端** → 主推**二维码**（手机扫码即在微信里打开）+ 微博/QQ空间/豆瓣直链。
  `navigator.share` 必须在**用户手势（click 回调）**里调用，不能在 `useEffect` 里自动调
  （浏览器报 NotAllowedError）；非安全上下文（http 非 localhost）下压根不存在，
  故要 `typeof nav.share === "function"` 判断。用户取消（`AbortError`）**不是错误**，静默返回。

  **二维码是零依赖自绘**（`lib/qrcode.ts` + `components/share/QrCode.tsx`）：
  纯函数编码器（字节模式、纠错 M、版本 1–10 自适应），渲染成 SVG `<path>`
  （横向合并连续暗块减少节点）。**不用 canvas** —— SSR 安全、可断言、无水合抖动。
  ⚠️ **编码器必须用独立实现交叉验证**：自研 QR 最坑的是"看起来对但扫不出来"。
  做法是拿 `qrcode`（第三方）+ `jsqr`（独立解码器）在 `/tmp` 做**往返解码**
  （已验 5/5 通过，含中文与完整分享 URL）。实测抓出的错有：
  ① 分块/交织参数表（`EC_M`）几乎每行都错 → 照 `qrcode` 的表逐版本核对；
  ② 格式信息/版本信息/保留区的写入位置错 → 照 spec 重写；
  ③ 惩罚分值（掩码选择）规则 1–3 有 bug。
  **`MAX_VERSION = 10` 是刻意的**（v11+ 的表太大），字节模式上限 **213 字节**。
  真实分享 URL ≈120 字节 → v7–8，够用。超长时 `pickVersion` 返回 `null`
  （`encodeQr` 抛错）——**绝不静默截断**。

  **内测口令与分享冲突的解法：HMAC 签名令牌绑死路径**（`lib/share.ts`）。
  分享链接带 `?share=<exp>.<sig>`，中间件**三点判据缺一不可**：
  ① 路径在 `SHAREABLE` 白名单内（三类公开页正则）；
  ② 签名对该**逐字相同的 pathname** 有效（含 scope）；
  ③ 必须是 **GET / HEAD**。
  放行时**顺手种 `preview_auth` cookie**，否则访客点第二下又被口令页打断。
  **私有路径（/console /admin /pay）结构上永不放行**，即使拿着有效令牌。
  不采用"`?share=1` 就放行"——那是全站后门。

  **⚠️⚠️ 最贵的一个坑：middleware 跑在 Edge runtime，那里没有 `node:crypto`。**
  顶层 `import { createHmac } from "crypto"` 会让**每个请求 500**
  （`The edge runtime does not support Node.js 'crypto' module`），
  **不是 307、不是白屏，是 500**。
  **最阴的地方**：500 会让"无令牌应被拦"类断言**看起来通过**
  （请求确实没到达目标页）→ 假绿一片。当时看到 55/59 "通过"，实际中间件是坏的。
  修法：`lib/share.ts` 主体改用 **Web Crypto（`crypto.subtle`）**，
  所有函数变 `async`；middleware 里 **`verifyShareToken` 必须 `await`**
  （不 await 拿到 Promise，恒真 = 白名单内**一律放行**，实测无令牌也返回 200）。

  **⚠️ 另一个反直觉的发现：`import("node:crypto")` 惰性加载也救不了。**
  webpack 打包 Edge bundle 时，只要该引用出现在**被 middleware import 链遍历到的模块**里，
  构建就**直接失败**：`UnhandledSchemeError: Reading from "node:crypto" is not handled`。
  连"静态引用一下但从不调用"也会触发。所以"惰性 import 就安全"是**错觉** ——
  安全的前提是**整个文件里根本没有它**。据此**删掉了同步版 API**
  （`createShareTokenSync`/`verifyShareTokenSync` 零调用方，留着只是构建期地雷）。
  将来若确需 Node 侧同步 API，请新开 `lib/share-node.ts` + `import "server-only"`，
  让它在结构上不可能被 middleware 引用。

  **四条 Edge 安全断言锁死这件事**（源码层）：
  ① middleware 不 import node:crypto；② share.ts 用 `crypto.subtle.sign`；
  ③ middleware 里 `verifyShareToken` 被 `await`；④ **share.ts 全文无 node:crypto 引用**（含惰性 import）。

  **隐私口径**：公开馆/祠分享卡带馆名 + 逝者名（馆主本就把这些公开挂在页面上）；
  **私密馆标题脱敏**（`hall.isPublic ? \`${hall.name} · 纪念${hall.deceasedName}\` : hall.name`），
  且保持 noindex。分享按钮对私密页仍可用（供馆主发给亲友）。

  **验收脚本自身踩的坑（都不是产品问题，记下来省下次）**：
  1. **`AUTH_SECRET` 不在子进程环境里** —— `npx tsx` 不自动加载 `.env`，
     必须显式传（脚本里 `TSX_ENV` 从 `.env` 提取）。不带的话 `createShareToken`
     返回 null，单元断言全部落空。
  2. **tsx 把 `/tmp/*.ts` 按 CJS 编译，不支持顶层 `await`**（`ERR_REQUIRE_ASYNC_MODULE`）
     → 整段包进 async IIFE。
  3. **`pickVersion` 越界返回 null** —— 拿 500/700 去测单调性必假红，须在有解区间比。
  4. **`canvas` 假红** —— `QrCode.tsx` 的**注释里就写着"不用 canvas"**，
     直接 grep 必然命中 → 断言须剥注释 + import 行再查。
  5. **种 `preview_auth` 必须用 `context.addCookies`，不能用 `addInitScript` 写 `document.cookie`**
     —— 后者在 about:blank 阶段执行，部分 Chromium 版本会随导航被清掉，
     表现为"分享条没渲染"（**看着像组件坏了，其实是门没让过**）。
  6. **验中间件行为用 `page.request.get(url, {maxRedirects:0})`，不要用 `page.goto`**
     —— goto 在导航期间就吃掉重定向，`p.url()` 的取值时机不确定，
     实测**同一份代码连跑两次得到相反结论**。`request.get` 是纯 HTTP 语义，
     直接摊开 307 与 Location，判据幂等。（连跑三次全绿才算数。）

  **四组反向验证**（全部记录在 `verify-share.mjs`）：
  ① **去掉 `await`** → **4 条变红**，含「无令牌被拦」报出无令牌请求返回 200
     （真的是全站公开，不只是断言失配）✅；
  ② **middleware 静态引用 node:crypto** → 构建直接
     `UnhandledSchemeError` 失败 ✅；
  ③ **share.ts 用 `createHmac`** → 「全文无 node:crypto 引用」变红 ✅；
  ④ **篡改令牌末位字符** → 服务端 `curl` 实测 307 到口令页（正确拒绝）✅。

- **品牌色彩体系（2026-10 定案）：全站从冷蓝灰改为"墨金"，色彩锚在 LOGO 上。**
  完整说明见 `docs/品牌色彩体系.md`，验收 `scripts/verify-brand-palette.mjs`（59 项，含 3 组反向验证）。

  **一句话**：不是另挑一套好看的配色，而是**把 LOGO 的两个主色直接做成色阶锚点** ——
  `brand-800 = #3a2f18`（LOGO 底色，ΔE=0.00）、`accent-300 = #e8c56d`（LOGO 金高光，ΔE=0.00）。
  改 `tailwind.config.ts` 一处，全站 1900+ 处色类自动跟随，**零组件改动**。

  **⚠️ 三条硬约束，都是"违反了不报错、只静默变丑"的类型：**

  **① 色阶双角色 —— 香槟金绝不能进 `brand-*`。**
  `brand-400/500` 是**白底上的正文/次要文字**（233+200 处），
  `brand-700/800/900` 是**深底、白字压其上**（787 处）。两者都要求"够深"。
  一旦把 `brand-400` 换成亮金色，全站 433 处正文**当场变成浅字压白底**。
  金色只存在于 `accent-*`，做**装饰**（描边/渐变/图标）。

  **② `accent` 也是双角色 —— 它叫"金"，但 164 处是文字。**
  `text-accent-600`（143 处）+ `text-accent-500`（21 处）意味着
  色阶里的"金"必须是**深金/古铜金**（`#8f6f18` 4.71:1 ✅ / `#7d5f14` 5.97:1 ✅）。
  亮香槟金 `#e8c56d` 落在 `accent-300`，专供描边/渐变/图标。
  **别把 500/600 往上提亮** —— 那是 164 处文字的对比度。

  **③ 暖灰不撞车 —— 浅档要与 `brand` 浅档"同族但可辨"。**
  Tailwind 默认灰偏冷发蓝，与墨金暖调打架，本次覆盖为暖灰（549 处随之统一）。
  但两套浅色不能糊：断言 `ΔE(gray-100, brand-100) ∈ [1.5, 6]`（实测 2.39）、
  `ΔE(gray-300, brand-300) ∈ [6, 40]`（实测 13.26）。
  太小 → 卡片边框与背景糊成一片；太大 → 冷调又回来了。

  **顺带修掉的静默缺陷**：配置里原先**根本没有 `brand-200/300/400`**，
  但代码里有 **233 处 `brand-400` + 44 处 `brand-300` + 12 处 `brand-200`**。
  Tailwind 找不到色值就不生成类 → **这些类此前全是空样式**（不报错、不警告、页面照常）。

  **首页五大板块卡片（"墨金骨架 + 专属主色"）**：
  五张共用同一骨架（顶部渐变条 + 图标 + 标题 + 描述 + 进入），只靠一个专属主色区分 ——
  放在一起是"一套体系里的五个分支"，而不是五张各画各的卡。
  主色走**内联 CSS 变量**（`--tone` / `--tone-soft`），
  **不写 5 套 Tailwind class**：`feature-tone-memorial` 这类动态拼出的类名
  Tailwind 静态提取不到，构建后是空样式（本节 ① 同源的坑）。
  五个主色 L\* 收在 36.8–45.4（跨度 8.6），色相拉开而明度齐平。

  > ⚠️ **调主色时别只验"压白底"**。卡片底是暖白渐变（末端 `brand-100 #f2ede4`）而非纯白，
  > 要求更严。第一版 `live=#ad5d12` 压白底 4.83:1 看着没问题，
  > 压卡片底只有 **4.14:1**，被 §6 精确抓出。现改为 `#a55710`（4.54:1）。
  > 断言因此对五个主色**按卡片底色而非白底**判 ≥4.5。

  **明确"不改"的地方（重要）**：`lib/hall-decor.ts`（38 行旧 hex）、`lib/decor-3d.ts`、
  `lib/decor-skin.ts`、`lib/decor-suites.ts`、`components/clan/arch/palette.ts`、
  `components/hall/HallDecorLayer.tsx`、`components/decor/DecorPagePreview.tsx`
  里的旧色值 —— 这些是**装修素材自带的设计色**（"素线框"的边框色、"赭石"梁柱三色、
  各套件预览底的冷暖配比），是**内容**不是**品牌**。
  跟着换会让**老用户已购素材的外观漂移**（花 150 积分买的"素线框"一夜之间变了个颜色）。
  判据：`lib/decor-*` / `lib/hall-decor.ts` / `components/decor/*` / `components/clan/arch/*` 一律不动。

  > 断言自身踩的坑：**`grep` 输出是 `路径:行号:内容`，而内容里也可能含过滤关键词。**
  > 第一版按整行 substring 判定"是不是装修文件"，把 `components/decor/DecorPagePreview.tsx`
  > （路径属品牌层、内容里写了 `#1f262e`）误判成装修文件 → §8 假绿。
  > 修法：**只取冒号前的路径段**判定归属。

- **钱包（福币）与双币种定价（2026-10 定案）。**
  完整说明见 `docs/钱包与福币定价.md`，验收 `scripts/verify-fortune-wallet.mjs`（91 项，含反向验证）。

  **口径**：1 福币 = 1 元人民币；充值 5–599 元；档位 100/199/299/399/499/**599**（送 20/30/50/80/120/**220**）；
  自定义按「≤金额的最高档」；全平台价格以福币为主、括号标注人民币。

  **⚠️ 两种精度，别混 —— 这是最容易搞错的地方**：
  - **余额（`User.fortuneCoins`）恒为整数**（充值整元、赠送整数）；
  - **商品价可以是一位小数**（0.1 元）—— 装修素材有 **14 处非整元价**
    （晨雾青 1.5 / 素线框 1.2 / 云纹地毯 3.5 …）。换算入口是 `fubFromFen`，
    实现为 `Math.round(fen / 10) / 10`。

  **⚠️ `fubFromFen` 曾经是 `Math.round(fen / 100)`，是静默价格漂移**：
  1.5 → 显示 2 福币（**+0.5**）、1.2 → 显示 1 福币（−0.2）。用户看不出错，
  但**展示价 ≠ 账本价**。修完顺手抓出 **7 处手写换算**（`gallery/decor`、
  `console/whispers/[id]`、`StoragePanel`、`DecorStudio` 的 `yuan()`、`points/guide`、
  `suites`、`admin/products`、`lib/decor-suites.ts` 的 `suitePriceYuan`）
  —— 全是「同一个事实的第二个判据」，精度还不一样（两位 vs 一位、0.01 vs 0.1）。
  现全仓只剩 `lib/fortune.ts` 一处实现。
  反向验证：改回 `/100` → **6 条精确变红**，逐件点名
  `晨雾青 显示 2 福币 ≠ 实际 1.5 福币（150分，Δ0.50）`。

  **`Product.fubPrice` 派生列已删除**（迁移 `20261002000100_drop_product_fubprice`）。
  它是 `Int`，装不下 1.5 → 注定落后于真相。展示层一律从 `price`(分) 现算。

  **账本 vs 展示的边界**：`OrderItem.unitPrice` / `Payment.amount` 恒为**分（人民币）**，
  支付页 / 后台订单 / 成交额 / JSON-LD `priceCurrency` 也都是人民币 ——
  **改币种只改展示层**，把账本也改成福币会让币制与账目绕在一起。

  **福币三条性质**：① **不过期**（`FortuneLog` 结构上没有 `expireAt` 列，断言锁死；
  与积分 12 个月有效期刻意区别：积分是行为激励，福币是充值资产）；
  ② 每笔写流水；③ **履约只读快照**（订单冻结 `topupYuan`/`bonus`，
  绝不运行时重算 `bonusFor`，否则调档位表会让历史订单额度漂移）。
  **充值订单不返消费积分**（否则"充 150 元得 450 积分"是刷分漏洞）。

  **充值上限曾经低于最高价（真倒挂）**：上限 499 < 最贵单品 ¥599「星河长明」
  → 买最贵那件要分两次充、第一笔吃不到最高档。现抬到 599 对齐。
  新增 599 档送 220（比例 24.0% → **36.7%**，对齐竞品云寄念 36.8%），**原五档不动**。

  **商城祭品价格带重构**：20 款原挤在 5 个价位（2/3/5/6/8，2 元 5 款 + 3 元 9 款 = 70% 重合），
  现拉成 **7 个价位 1/2/3/5/8/12/18**（3/2/7/3/2/2/1 款），分档依据是**动效视觉复杂度**
  （定义在 `prisma/seed-product-tiers.mjs` 的 `PAID_RITUALS`）。
  **改价零风险的前提是"实测全部零销量"**（`salesCount` 全 0、真实订单仅 1 笔测试遗留）——
  这是「不动存量价格」纪律（集体提价会让老用户已买权益贬值）的**例外条件**，
  日后有真实销量时改价必须逐件评估。

  **市场对标结论**：1:1 币制优于竞品「1 元 = 10 币」（用户不用心算）；
  明确不学三条 —— **孝心排行榜**（央视点名，冲榜需近 5000 元）、
  **虚拟祭品过期续费**、**豪华别墅/私人飞机等天价虚拟品**。
  长明灯年卡 9.8 元的描述里**主动写明**竞品价（¥168–268/年、永久 ¥598 起）做事实对比，
  但**不做倒计时、不做施压文案**。

  **⚠️ 验收脚本自身踩的三个坑（都不是产品问题）**：
  1. **拼 `psql -c "..."` 时 bcrypt 哈希的 `$2a$10$` 被 shell 当变量吃掉**
     → 库里存的是碎哈希 → **登录永远报「账号或密码错误」**
     （看着像"登录流程坏了/断言时机不对"，其实是脚本自己把密码写坏了）。
     修法：`spawnSync` + **stdin 传 SQL**（完全不经过 shell），再配 `lit()` 做单引号字面量；
     并加一条「哈希原样落库」自检断言。
  2. **`!/8\s*福币/` 会误命中「18 福币」** —— 断言"不出现某价格"必须锚定左边界
     `(^|[^\d.])8\s*福币`。同款隐患在 3 个文件里都抓到（另含 `/0\s*福币/` 误命中「10 福币」）。
  3. **断言不能写 `ptsAfter === 0`** —— 新注册用户有 `INITIAL_POINTS` 积分（现为 5）。
     要验"充值不返积分"，正确口径是 **充值前后不变**，不是"等于 0"。

- **资源引用与文件扩展名脱节（2026-10 修复）**：`public/assets` 下的封面早已从生成的
  SVG 换成真实 `.jpg`，但 `prisma/seed-content.mjs` 的引用没跟着改
  → 6 个资源 404（`cover-policy.svg` / `cover-culture.svg` / `cover-story.svg` /
  `cover-announcement.svg` / `prod-flower.svg` / `hall-cover.svg` / `live-cover.svg`）。
  不报构建错、页面照常渲染，只在浏览器控制台留一串 404 —— 由
  `verify-product-pricing.mjs` §8「无控制台错误」抓出。已全部改 `.jpg` 并重跑 seed。

- **⚠️ 免密登录后门（2026-10 修复，安全级）**：`lib/auth.ts` 的 Credentials
  `authorize` 曾用一个**明文参数** `smsMode="1"` 跳过密码校验（本意是给短信验证码登录复用）。
  但 `/api/auth/callback/credentials` 是**公开端点**，任何人 POST 时带上
  `identifier=admin@test.com&smsMode=1` 即可**免密登录任意账号（含管理员）**——
  实测确凿（修复前拿到了 `authjs.session-token` 并能访问 /console）。

  **修法**：把明文开关换成**服务端签发的一次性票据**
  （`lib/quick-login.ts` 的 `createSmsVerifiedTicket` / `verifySmsVerifiedTicket`）：
  HMAC-SHA256 签名 + 绑定手机号 + 2 分钟过期；`authorize` 只认票据，
  且校验"票据绑定的手机号 == 本次 identifier"（防拿 A 的票据登 B）。
  短信登录 action（`app/login/actions.ts`）改为验证码通过后签票据。

  **三层防线（都要保留）**：
  1. 类型层：`credentials` 只声明 `identifier / password / smsTicket`，
     读 `smsMode` 直接 **TS 编译失败**（`Property 'smsMode' does not exist`）；
  2. 逻辑层：`authorize` 无任何"明文开关跳过密码"的分支；
  3. 验收层：`scripts/verify-auth-security.mjs`（18 项）——
     真服务 POST 攻击、伪造/畸形票据、正常密码登录不被误伤、
     票据单元（篡改/过期/scope 隔离）。
     反向验证：注入明文旁路 → 「smsMode=1 免密攻击」**精确变红**。

  **scope 隔离**：一键登录令牌（`quick-login`）与短信票据（`sms-verified`）
  scope 不同，**不能互相冒用**（已验证）。

  教训：**任何"免密/跳过校验"的开关，都不能是客户端可传的明文参数。**
  必须是服务端签发、绑定主体、短时效、可验证的票据。

- **一键登录（2026-10 新增，内测演示用）**：`/quick-login?t=<令牌>` 手机点开即登录。
  令牌由 `scripts/make-quick-login.mts` 签发（`BASE_URL=... npx tsx scripts/make-quick-login.mts admin 3600`）。
  - **登录走标准密码校验**（密码从 `DEMO_ACCOUNT_PASSWORD` 环境变量读，不写进链接），
    **绝不**借道 `smsMode` 那类免密开关。
  - 页面必须在 **Server Action**（`app/quick-login/actions.ts`）里调 `signIn`——
    在 Server Component 渲染期调用会写不了 session cookie（实测页面停在"加载中"）。
  - action 里顺手种 `preview_auth` cookie，否则手机端登录后跳 /console 会被中间件弹回口令页。
  - `/quick-login` 已加入 `middleware.ts` 的 `ALLOWED_PREFIXES`（否则先被口令页拦住）。
  - **上线前应删除**本页面 + 中间件白名单项 + `scripts/make-quick-login.mts`。

- **验收脚本别硬编码隧道域名**：`verify-public-login.mjs` 曾写死旧域名
  `zongyitang.lhr.rocks`，域名换成 `zongyimemorial.com` 后常年以
  `ERR_SSL_PROTOCOL_ERROR` 挂掉。已改为 `process.env.BASE_URL || "https://zongyimemorial.com"`。

## 已知环境陷阱

- **往 psql 传含 JSON 字面量的 SQL，不要拼在 `-c` 里。**
  那串东西要穿三层引号（JS → shell → psql），必然被剥坏，报错长这样：
  `syntax error at or near "tpl"` —— 看着像 SQL 写错了，其实是 shell 把引号吃了。
  稳妥做法：把 SQL 写进临时文件 → `docker cp` 进容器 → `psql -f`（见
  `verify-decor-3d.mjs` 的 `psqlFile()`）。
  同理，**中文引号里不要嵌 ASCII 双引号**：`check("…要求"各加10套"…")` 会让 node 报
  `SyntaxError: missing ) after argument list`。

- 重启服务前必须确认端口 3000 无僵尸进程，否则 `EADDRINUSE` 会让**旧构建继续服务**，表现为"改了代码没生效"或登录 500。
  清理方式：`ss -ltnp | grep :3000` 取出 pid → `kill -9`。
  注意 `run-all-verify.sh` 等套件依赖服务在跑，所以「构建 → 杀端口 → 重启 → 再验收」的顺序别省。
- `prisma generate` 后若类型不生效，清 `tsconfig.tsbuildinfo` 与 `.next/cache`。
- Server Action 表单**不要**用 `<button name="decision" value="...">` 传决策值（multipart 下该字段会丢失，导致 action 静默返回）。统一用 `components/admin/DecisionButton.tsx`。

### next/image 迁移的两个坑（2026-10 P0 阶段踩到）

- **⚠️ middleware 口令拦截会拦死图片优化器（真 bug，`verify-product-pricing` 抓到）。**
  next/image 的 `/_next/image` 是**服务端 self-fetch 源图**（如 `/assets/xxx.png`），
  内部请求**不带 preview_auth cookie** → 被 middleware 307 到门页 →
  优化器拿到门页 HTML → 返回 400（服务端日志：`The requested resource isn't a valid image ... received null`）。
  裸 `<img>` 时代浏览器带着 cookie 直连所以从无此症状——**迁移后必现**。
  表现很迷惑：用 sharp 单测源文件解码正常、PIL 也能开、`file` 显示合法 PNG，
  挣扎半天发现是"自我请求被自己的门拦了"。修法：`ALLOWED_PREFIXES` 加 `/assets`
  （public/assets 是打包进库的品牌素材，零敏感，与 `/uploads` 同口径）。
  **判别命令**：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/assets/xxx.png`（无 cookie）——
  307 就是这个病，200 才健康。凡"服务端自己 fetch 本站资源"的新功能（OG 图生成等）都会踩同款。
- **React SSR 插值注释会断开断言正则（假红）。**
  JSX 里 `近 30 分钟，{count} 位亲友` 渲染成 HTML 是
  `近 30 分钟，<!-- -->1<!-- --> 位亲友`——`<!-- -->` 分隔注释夹在插值两侧，
  跨插值的正则必失配。断言前先 `html.replace(/<!-- -->/g, "")` 再匹配。
  同类：Next 的 robots.txt 输出是 `User-Agent: *`（**大写 A**），断言正则用 `/i`——robots 协议本身大小写不敏感。

### 跑验证套件的几个坑（每次都踩，记牢）

> 别手搓批量循环了 —— 直接用 `bash scripts/run-all-verify.sh`。
> 它已按扩展名选运行器、用能通吃三种汇总行格式的 grep，并列出变红套件。

1. **验证脚本绝不能"自己拼出被测值"再拿去比对 —— 那是自产自销，改不改代码结果都一样。**
   2026-10 排查「装修案例厅主题打不开」时踩到最深的一次：
   我写了个探针，在脚本里 `const slug = "decor-clan-" + t.id` 自己拼出链接，
   再拿去和数据库比对。结果**页面改没改都显示同样的 43 条"打不开"**
   —— 因为我验的是"我拼的 slug"，根本不是页面渲染出来的链接。
   连跑三轮都"失败"，一度以为是修复没生效，实际是**验证方法错了**。

   两条硬规矩：
   - **必须从页面真实产物取数**：HTML（`fetch` 后从 `href="..."` 正则抓）、
     或 Playwright 的 `page.evaluate(() => [...document.querySelectorAll('a[href^="/mall/"]')])`。
     **禁止**在验收脚本里复刻一遍业务逻辑生成的 slug / 价格 / 键名去比对。
   - **判据要区分"内容"与"状态码"**：本项目 `notFound()` 返回的 HTTP 状态码是 **200**
     （全局行为，见「已知环境陷阱」），所以**不能靠 status 判 404**。
     而**页面文本里出现 "This page could not be found" 也不可靠** ——
     Next.js 把它作为错误兜底模板嵌在 hydration 脚本里，**正常页面同样含有**
     （我一度用 `/404|page could not be found/` 判定，把正常商品页全判成失败，
     得了个"43 套全挂"的假报告，白查半天）。
     可靠判据：看页面**是否真的渲染出该商品的 `<title>`**
     （正常页形如 `<title>素朴（空间模板） · 空间装修 · 宗忆堂</title>`），或是否渲染出商品名。
   一句话：**先想清楚"这个断言在缺陷存在时会不会变红"，再写它。**

2. **扩展名决定运行方式**：`scripts/*.mjs` 用 `node`，`scripts/*.mts` 必须用 `npx tsx`。
   对 `.mts` 用 `node` 会抛 `requireStack: []` 的 `ERR_UNKNOWN_FILE_EXTENSION`，
   看起来像"测试崩溃"，其实只是跑错了命令。`verify-whisper-compliance` / `verify-whisper-billing` /
   `verify-clan-tribute` / `smoke-clan-tribute` 都是 `.mts`。
   **坑**：在 `run_one` 里把 `"npx tsx"` 当**单个变量**传给 `"$runner" "$file"` 会失败
   （词被当成一个可执行名），表现是批量里这些套件全部「未产出结果」而 `失败=0` ——
   看着像通过，其实一行都没跑。`run-all-verify.sh` 已改为显式 `if [ "$runner" = tsx ]` 分支。
   另：`npx` 首次解析包时会把 `npm notice` 混进 stderr，退出码也偶尔被管道吞，
   所以**判定只认汇总行 + 失败标记，别信退出码**。
   人工核对单个 `.mts` 是否真跑起来：`npx tsx scripts/verify-clan-tribute.mts | tail -3`。

2. **汇总行格式不统一，别用一个 grep 通吃**。目前存在三种：
   - `结果: 41/41 通过`（`verify-console`、`verify-clan-tribute-e2e`）
   - `通过 62/62`（`verify-product-pricing`、`verify-clan`、`.mts` 系列）
   - `===== 阶段5 验收：63/63 PASS =====`（`verify-whisper-console`、`verify-whispers-e2e`、`verify-admin-review`）
   批量跑时若只匹配一种，其余会显示"未产出结果"（**且失败计数为 0**），极易误判成通过。
   稳妥做法：`grep -E "通过 [0-9]+/[0-9]+|结果: [0-9]+/[0-9]+ 通过|[0-9]+/[0-9]+ PASS"`。

4. **验收脚本过内测口令：直接种 cookie，别去填 /preview-gate 表单。**
   中间件只认 `preview_auth=1`，而门页的 `PreviewGateForm` 靠客户端 JS 做整页跳转，
   在脚本里既慢又容易和后续导航打架（会卡在门页）。
   照 `verify-product-pricing.mjs` 的写法：
   ```js
   await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
   ```

6. **验收脚本必须自清理，否则会把自己的兄弟断言跑红（且极难查）。**
   供台陈列（`OfferingOnAltar`）与祭品库存（`OfferingHolding`）都是**跨套件共享**的业务数据：
   - `verify-hall-niche` §5 点「献上音乐」后不撤供 → 每跑一次就多一件 `free-music`，
     攒够几次后把同套件 §4 的「glyph 不重复（同一份供品不叠画）」跑红。
   - 免费品是**每日 3 份**的消耗制，同一天内重复跑会把 `free-music` 用到 0，
     按钮变 disabled → 环境音断言以 `src="" / paused=true` 失败。
     **看着像功能坏了，其实是测试数据耗尽**。
   规则：任何"点一下献祭"的套件，收尾都要 `update "OfferingOnAltar" set "clearedAt"=now()`
   并把用掉的免费品补回（`greatest(quantity, N)`）；断言前显式备货，别赌库存还剩多少。
   判据：**同一套件连跑三次都应全绿**。只跑一次就绿，可能只是恰好还有货。

5. **断言别挑"要数据才渲染"的板块。**
   例如「故人数字档案」只在馆主填了时间线/相册时才存在。
   写成 `text.indexOf("故人数字档案") < text.indexOf(...)` 会在数据为空时变成
   `-1 < N` 恒真，看着通过其实什么都没测。正确做法：先取下标，
   为 `-1` 时**显式跳过并打印原因**（参考 `verify-offering-panel.mjs` §6）。

3. **断言别硬编码种子数量**。库里除了种子数据，还有正常业务数据（用户自己建的宗祠/纪念馆）。
   曾经 `verify-clan.mjs` 写死 `宗祠数据存在（3 座）`，用户建了第 4 座就变红。
   正确写法：断言**下界 + 种子专属条件**，例如
   `hallRows.length >= seedCount && seedCount >= 3`（seedCount 只数 admin 名下的）。
   同理，"含字辈诗"这类断言要看数据是否存在再断言，否则断言的是"空数据也渲染空板块"。

7. **`xpath=ancestor::div[...][1]` 不是"最近的祖先"，是文档序第一个匹配。**
   用它定位卡片会**跨层跑到别的容器上**（甚至定位不到），报出来是
   「未找到卡片 / 未定位到卡片」——看着像功能坏了，其实功能好好的。
   正确做法：在 `page.evaluate` 里用 `closest()`，它才按 DOM 层级就近向上。
   参考 `verify-decor-3d.mjs` 的 `cardText()` / `verify-clan-e2e.mjs` 的 `clanCardText()`。

8. **定位卡片必须避开"方案摘要"里的同名文字。**
   工坊页面里模板名会出现**两次**：一次在卡片标题（`span.text-sm.font-medium`），
   一次在右侧方案摘要（`span.text-brand-700`）。用 `hasText` 过滤容器会先撞上摘要，
   拿到的"卡片文本"其实不含按钮 → 断言误报。
   稳妥做法：先按**卡片标题的精确 class** 找到 span，再 `closest()` 向上取卡片体。

9. **需求变了，跟着改断言，别把产品改回去。**
   `verify-clan-e2e.mjs` 原以「朱漆祠堂」为"免费模板"断言有「一键应用」按钮；
   用户要求"除建馆赠品外全部改付费"之后它变成 600 积分，断言必然落空。
   这是**需求变更**不是回归 —— 正确做法是把口径改成「赠品可直接应用 + 收费模板不得白给」，
   并补一条反面对照（否则"全都免费"的灾难反而测不出来）。
   同类：`verify-hall-niche-noportrait.mjs` 只摘遗像、没保证"壁龛模式"这个前提
   （该馆挂饰是 `orn-none`，两条腿同时断 → 场景本就不该渲染）。
   修法是**开局显式备好前提**（把挂饰临时设为 `orn-niche-wall`）并在收尾恢复，
   而不是放宽断言。

10. **`getByRole("button", { name: /A|B/ })` 会漏掉明明存在的按钮。**
    `verify-clan-e2e.mjs` 里赠品卡片的按钮文本明明是「重新应用」（`clanCardText()`
    取到的 innerText 里看得见），`getByRole("button", { name: /一键应用|重新应用/ })`
    却是 0 命中 —— accessible name 的取词规则和 innerText 不是一回事，
    带 `|` 的正则组合词尤其容易失配。报出来是「赠品卡片里没有一键应用按钮」，
    看着像功能坏了，其实按钮就在那儿。
    **做法：跟 `clanCardText()` 同一套取法** —— 在 `page.evaluate` 里
    `box.querySelectorAll("button").map(b => b.textContent.trim())`，
    再按文案 `locator("button", { hasText: label })` 点。

11. **断言别依赖上一步的残留状态。** 复跑就会翻车，而且翻得很像功能缺陷。
    `verify-decor-draft-save.mjs` 的"放弃改动"段原先假设前面一定留下了未保存改动；
    复跑时壁纸恰好已是目标值 → `dirty` 为假 → 草稿条整条消失
    → 报「找不到放弃改动」。**这其实是"没有未保存改动"的正确行为**。
    修法：让断言**自己制造前提**（依次试到草稿条出现）再断言，
    而不是放宽匹配或跳过。判据仍是「同一套件连跑三次全绿」。

12. **客户端组件里的元素，服务端 HTML 里没有。**
    `HallBuyButton` 的创建流程条只在弹窗打开后才进 DOM；
    用 `fetch()` 读 HTML 断言 `data-create-flow` 必然为 0 命中 ——
    会把"做了"误判成"没做"。凡是要验客户端渲染的东西，
    一律走 Playwright **真点击**再看 DOM。

13. **数"函数调用"不能数"字符串出现次数" —— 注释和 import 会让断言恒绿。**
    `verify-obituary.mjs` §1 初版写的是
    `(src.match(/grantObituaryQuota/g) || []).length >= 2`。
    反向验证 D2（把 `points/actions.ts` 里的履约分支整段删掉）时**它依然是绿的**：
    剩下的两次命中是 `import { grantObituaryQuota }` 和**一行注释里提到的函数名**。
    **这就是断言假绿**，只有反向验证能发现。
    修法：先剥掉注释与 import，再数调用形态。
    ```js
    const strip = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
    (strip(src).match(/grantObituaryQuota\s*\(/g) || []).length
    ```
    教训推广：**任何"源码层断言"，都要先问"这个字符串会不会出现在注释里"**。
    更稳的做法是断言**结构性特征**（正则匹配调用点上下文），而不是计数。

14. **验收脚本里的 `execFileSync` 必须检查退出码，否则 SQL 静默失败。**
    写 `verify-obituary.mjs` 时用 `execFileSync("docker", ["exec", ..., "psql", "-c", sql])`
    却没接 `try/catch`：一条**主键冲突**的兜底 INSERT 报错后**被完全吞掉**，
    表现为"配额没补上 → 按钮 disabled → `page.click` 超时崩溃"，
    排查了很久才意识到根因是自己那条 SQL。
    两个必修项：
    - `psql()` 包 `try/catch` 并**把 SQL 打出来**（否则只看到 psql 的英文报错，不知道是哪句）；
    - 兜底 INSERT 的 **id 必须每次唯一**（带时间戳/随机串）。
      `ON CONFLICT ("userId") DO UPDATE` **只覆盖 userId 唯一约束**，
      主键冲突不在它的范围内 —— 写固定 id（如 `${uid}-pub`）第二次运行必炸。

15. **只验 `<title>` 会漏掉"页面主体该拦却没拦"的缺陷。**
    `verify-obituary.mjs` §8 初版只断言"下架后匿名 `<title>` 不含逝者名"。
    反向验证 D5（删掉页面主体的 `status !== "published"` 检查）**没能变红**：
    因为 `generateMetadata` 里**有它自己那一份** status 检查，
    即便主体漏判、正文照常渲染，title 依然是泛化的 → 断言照绿。
    修法：**同时验正文与容器**（`!body.includes(正文片段)` +
    `[data-obituary-view]` 计数为 0）。
    推广：**一个事实若在多处独立判定（metadata / 页面主体 / 中间件），
    验收就必须逐处验，不能只验最显眼的那一处。**

16. **解锁/刷新类断言：等"状态锚点"，不要等"固定毫秒"。**
    同一段代码被 flaky 咬了两次：
    `waitForTimeout(2500)` 抓正文 → 偶发假红；
    改等 `[data-obituary-view]` 后，在"生产构建 + 服务刚重启首次编译该路由"
    场景下 15s 仍可能不够。
    最终拆成**两条独立且确定的判据**：
    - 接口层：`waitForResponse(/\/api\/obituary\/.*\/unlock$/)` 且 `{ok:true}`
      —— 证明密码校验与令牌签发本身正确；
    - 页面层：拿 cookie **重新导航**该 URL，再看锚点
      —— 这是真实用户路径（解锁后刷新），不受 `router.refresh()` 客户端时序影响。
    为此在页面 `<article>` 上加了 `data-obituary-view` 作为"已放行"的唯一锚点。
    **判据要有解释力**：锚点出现 ⟺ 服务端校验通过，这才叫确定。

17. **缺陷该红就让它红，并给回归脚本开"已知缺陷白名单"。**
    这条原则的实战样例是电子讣告的积分兑换上限缺陷
    （`REDEEM_SINGLE_LIMIT(=1000) < pointsPrice(=2900)`，49 个在售高价商品兑不出）。
    当时 §3 的两条断言（兑换后配额 +1 / 积分 -2900）**故意保持红色**，并在
    `run-all-verify.sh` 里加 `KNOWN_RED="verify-obituary"` 单列、不污染其它套件。
    该缺陷已于 2026-10 后按「日上限 5 万 + 单次不设上限」决策修复（见 `docs/电子讣告.md` 第 6 节）：
    §3 已转为正向断言（配额 +1 / 积分 -2900 全绿），`KNOWN_RED` 一并清空。
    **不要图省事把这些套件从批量列表里删掉 —— 删掉就再也看不见了。**
    修复缺陷后这两条自动转绿，届时一并移除白名单条目。


### 隧道与「页面加载遇到问题」

现象：页面偶发白屏「加载遇到问题」，刷新能好。

**根因是 localhost.run 免费版的自定义域名边缘路由不稳**，请求约 30–50% 落在没有该隧道的边缘节点上，
返回 `HTTP/1.0 503` + 响应体 `<h1>no tunnel here :(</h1>`。
判别方法（关键）：看 HTTP 版本 —— `HTTP/1.0 503` 是**边缘**回的；`HTTP/1.1 200` + `X-Powered-By: Next.js` 才是我们的应用。
所以"503"不代表服务挂了，别去查代码。

**2026-10 补记：还有第二种失败形态 —— TLS 握手失败（`curl exit=35`）。**
它比 503 更早、更隐蔽：连 HTTP 状态码都没有，`%{http_code}` 直接是 `000`。
实测一轮 20 次里 12–13 次是 `exit=35`（成功率仅 35–40%）。
**不要把它当成"隧道挂了"** —— 同一个 URL 紧接着再请求往往就 200。
用 `curl -w 'code=%{http_code} exit=%{exitcode}'` 区分：
`exit=35` 是 TLS 层，`code=000` 只是结果不是原因。
**也别把超时当原因**：把 `--max-time` 从 8 放宽到 20 秒后失败率纹丝不动，
说明不是慢，是连接压根没建起来。

**因此前端加了自动重试**（`app/error.tsx`）：错误边界会先自己重试 3 次
（延迟 0.8s / 1.6s / 3s，共约 5.4s），仍失败才让用户看到「重试」按钮。
用 `sessionStorage` 计数保证"同一轮抖动"总共只自动重试 3 次
（否则 `reset()` 重新挂载组件会让计数器归零 → 无限重试打转）；
组件卸载时清计数，让下次新错误仍能自动重试。
提示文案会切到「正在自动重连…」，用户不会以为自己点错了。

> 判据提醒：**验公网可达性时，"失败"多于一半也不一定是服务侧问题。**
> 先本地 `http://127.0.0.1:3000/login` 是否 200、`ssh` 隧道进程是否还在
> （判据见 `scripts/guard.sh` 的 `ensure_tunnel()`）。
> 本地健康 + 隧道进程在 = 应用没问题，是边缘抖。

排查命令：

```bash
# 看边缘 503 占比（期望 0 失败）
# ⚠️ 旧示例用的 zongyitang.lhr.rocks 已废弃，现为 Cloudflare Tunnel 域名
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code} ' --max-time 8 https://zongyimemorial.com/preview-gate; done; echo
# 看是谁回的
curl -s -D- -o /dev/null --max-time 8 https://zongyimemorial.com/preview-gate | head -3
```

**曾经踩过的坑（已修）**：`scripts/guard.sh` 原用 `curl https://$DOMAIN/` 做健康检查，
但沙箱所在网络根本访问不到自己的公网域名，`code` 恒为 `000` →
guard 每 60 秒误判"隧道挂了"并重建一次 → 边缘注册表堆满陈旧节点，**把 30% 的失败率放大成必然崩溃**。
现在改为：

- 隧道存活判据 = **`ssh` 进程是否还在**（隧道断了 ssh 会退出），不靠公网连通性；
- 后端健康判据 = **本地 `http://127.0.0.1:3000/login`** 返回 200/307/302；
- 保活请求也打本地，不浪费 12 秒超时。

改动见 `scripts/guard.sh` 的 `ensure_tunnel()`。

**另一个坑**：`pkill -f "plan@localhost.run"` 会匹配到包含该字符串的命令行父进程（比如你自己的 shell），
一并自杀。正确做法是按 PID 精确 `kill`：

```bash
PID=$(ps aux | grep "[s]sh -i /root/.ssh/lhr_key" | awk '{print $2}' | head -1); kill -TERM "$PID"
```

**另一个坑**：guard 的 flock 锁文件 fd 会被子进程（`npm run start` → `next-server`）继承。
所以只杀 guard 主循环而不杀 next-server 时，锁**仍然被持有**，新 guard 会 `flock -n` 失败直接 `exit 0`，
表现为"守护进程起不来"。解法：删掉锁文件 `/var/run/zongyitang-guard.lock` 再启动，或连子进程一起杀掉重建。

**维护方式**：guard 由 docker-init 里的 supervisord 托管，配置在 `/usr/local/share/supervisor/zongyitang.conf`
（`command=/bin/bash /workspace/scripts/guard.sh`，`autorestart=true`）。
supervisord 二进制在 `$IDE_EDITOR_SERVER_DIR/bin/`，该目录名是随机的（如 `/.PlnPyKFp4CRfFtgC1/`），
`supervisorctl` 可能不在 PATH 里。

