import Link from "next/link";

export const metadata = {
  title: "空间装修指引 · 宗忆堂",
  description:
    "纪念馆与宗祠的装修完整说明：模板与套件的区别、三条付费路径、赠品权益、保存与恢复默认。",
};

const TOC = [
  { id: "free", t: "一、建馆就送一套，永久免费" },
  { id: "flow", t: "二、装修四步走" },
  { id: "diff", t: "三、模板、套件、单件有什么区别" },
  { id: "pay", t: "四、三条付费路径" },
  { id: "3d", t: "五、什么是「立体」空间" },
  { id: "save", t: "六、保存、放弃与恢复默认" },
  { id: "offering", t: "七、装修与供奉是两回事" },
  { id: "faq", t: "八、常见问题" },
];

export default function DecorGuidePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <nav className="mb-6 text-sm text-brand-400">
        <Link href="/halls" className="hover:text-brand-700">
          数字纪念馆
        </Link>{" "}
        / <span className="text-brand-600">空间装修指引</span>
      </nav>

      <h1 className="text-3xl font-semibold text-brand-900">空间装修指引</h1>
      <p className="mt-3 leading-7 text-gray-700">
        纪念馆与宗祠都是<strong>免费建立</strong>的，装修则按需升级 ——
        你可以一直用建馆时赠送的那一套（它永久免费），
        也可以挑选更精致的模板与装饰套件，让空间更贴合故人或宗族的气质。
      </p>

      <nav className="mt-6 rounded-lg border border-brand-200 bg-brand-50/50 p-5">
        <div className="text-xs font-medium text-brand-700">目录</div>
        <ul className="mt-2 grid gap-1.5 text-[13px] sm:grid-cols-2">
          {TOC.map((x) => (
            <li key={x.id}>
              <a href={`#${x.id}`} className="text-brand-600 hover:text-accent-600 hover:underline">
                {x.t}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="free" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">一、建馆就送一套，永久免费</h2>
        <div className="mt-3 space-y-3 leading-7 text-gray-700">
          <p>
            申请纪念馆时，系统自动赠送 <strong>「壁龛纪念堂」</strong> 整套模板；
            设立宗祠时赠送 <strong>「祖德流芳」</strong>。
            这一套及其用到的全部素材（墙面、地面、挂饰、相框、字体）**永久免费**，
            不受后续任何调整影响。
          </p>
          <p>
            这一点有专门的保护机制：赠品记录在装修配置的独立字段里，
            「恢复默认」<strong>不会</strong>把它清掉 —— 它是平台承诺过的权益。
            你随时可以在工坊顶部的方案摘要里看到「赠品」那一行列出的内容。
          </p>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800">
            除建馆赠品之外，其余模板与装饰素材均为付费素材（积分或货币）。
            这是为了让免费馆与付费馆都把资源用在真正需要的精致度上，
            而不是靠"素材堆量"制造差异。
          </p>
        </div>
      </section>

      <section id="flow" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">二、装修四步走</h2>
        <ol className="mt-4 space-y-4">
          {[
            {
              n: "1",
              t: "挑一套模板",
              d: "模板一次换掉壁纸、地纹、挂饰、相框、字体五项，并决定空间的整体形态。立体模板会呈现可环视的 3D 空间。",
            },
            {
              n: "2",
              t: "按需替换单件",
              d: "在五个素材分类里单独挑选。手动改过任一项后就不再算整套模板，成为你的自定义搭配。「装饰套件」可以一次换好几件，且不覆盖你挑好的墙面与地面。",
            },
            {
              n: "3",
              t: "看预览",
              d: "工坊上方是实时预览，点「全屏预览」可整屏细看、拖拽环视。预览不写任何数据，可以放心试。",
            },
            {
              n: "4",
              t: "保存并完成装修",
              d: "点右上角「保存并完成装修」才真正生效。保存前顶部会一直提示「有未保存的改动」。",
            },
          ].map((s) => (
            <li key={s.n} className="flex gap-4 rounded-xl border border-brand-200 bg-brand-100/70 p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-sm font-medium text-white">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-medium text-brand-900">{s.t}</div>
                <p className="mt-1 text-[13px] leading-6 text-gray-600">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="diff" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">三、模板、套件、单件有什么区别</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-brand-200 text-left text-brand-700">
                <th className="py-2 pr-4 font-medium">类型</th>
                <th className="py-2 pr-4 font-medium">换掉什么</th>
                <th className="py-2 font-medium">会不会改变空间形态</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-brand-200">
                <td className="py-2.5 pr-4 font-medium text-brand-800">整套模板</td>
                <td className="py-2.5 pr-4">五个槽位全部替换</td>
                <td className="py-2.5">会（立体模板呈现 3D 空间）</td>
              </tr>
              <tr className="border-b border-brand-200">
                <td className="py-2.5 pr-4 font-medium text-brand-800">装饰套件</td>
                <td className="py-2.5 pr-4">只换挂饰 / 相框 / 字体</td>
                <td className="py-2.5">不会，保留你挑好的墙与地</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-brand-800">单件素材</td>
                <td className="py-2.5 pr-4">只换你点的那一项</td>
                <td className="py-2.5">不会</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-gray-600">
          「装饰套件」存在的意义就是<strong>不覆盖你认真挑过的墙面与地面</strong> ——
          一次点击只影响装饰部分，避免把已经搭好的基调推倒重来。
        </p>
      </section>

      <section id="pay" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">四、三条付费路径</h2>
        <p className="mt-3 leading-7 text-gray-700">
          收费素材的价值是<strong>一次性</strong>获得的（高级订阅除外），
          获得之后永久可用。有三条路可以拿到：
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "工坊内积分兑换",
              d: "在装修工坊里直接点素材卡片上的「用 N 积分兑换」，立即解锁，无需跳转。",
            },
            {
              t: "积分兑换页",
              d: "在「积分兑换」专区分批浏览与兑换，适合一次性把想要的素材都换齐。",
            },
            {
              t: "商城付费解锁",
              d: "在纪念商城的「空间装修」分类下用货币购买，与积分兑换落到同一份权益，两者不叠加。",
            },
          ].map((x) => (
            <div key={x.t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="text-[13px] font-medium text-brand-900">{x.t}</div>
              <p className="mt-1.5 text-[12px] leading-6 text-gray-600">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-800">
          <strong>买 ≠ 用。</strong>兑换或购买只是获得「使用权」；
          要真的换上，还得在工坊里<strong>选中它</strong>并点<strong>「保存并完成装修」</strong>。
          这是两步，别漏第二步。
        </p>
      </section>

      <section id="3d" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">五、什么是「立体」空间</h2>
        <div className="mt-3 space-y-3 leading-7 text-gray-700">
          <p>
            名字里带「立体」的模板，保存后馆页首屏会变成一幅可<strong>拖拽环视</strong>的
            三维空间 —— 墙面有纵深、构件有前后层次，左右拖动可以看到侧面的陈设。
          </p>
          <p>
            立体空间是<strong>程序化渲染</strong>的（浏览器原生 CSS 三维 + 手绘图形），
            不依赖任何外部图片素材。这样做是为了在网络不稳定时也能稳定呈现，
            不会出现"图加载不出来，馆变成一片空白"的情况。
          </p>
          <p className="rounded-lg border border-brand-200 bg-gray-50 p-4 text-[13px] text-gray-600">
            说明：只换壁纸、地纹、挂饰等<strong>单件素材不会</strong>改变空间形态 ——
            空间骨架由模板决定。想让空间"立起来"，需要选一套立体模板。
          </p>
        </div>
      </section>

      <section id="save" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">六、保存、放弃与恢复默认</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-brand-200 text-left text-brand-700">
                <th className="py-2 pr-4 font-medium">操作</th>
                <th className="py-2 pr-4 font-medium">什么时候生效</th>
                <th className="py-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-brand-200">
                <td className="py-2.5 pr-4 font-medium text-brand-800">点素材 / 套件 / 模板</td>
                <td className="py-2.5 pr-4">仅改动预览</td>
                <td className="py-2.5">属于草稿，不写库，可以随便试</td>
              </tr>
              <tr className="border-b border-brand-200">
                <td className="py-2.5 pr-4 font-medium text-brand-800">保存并完成装修</td>
                <td className="py-2.5 pr-4">立即写库</td>
                <td className="py-2.5">馆页同步更新，装修完成</td>
              </tr>
              <tr className="border-b border-brand-200">
                <td className="py-2.5 pr-4 font-medium text-brand-800">放弃改动</td>
                <td className="py-2.5 pr-4">—</td>
                <td className="py-2.5">退回上次保存的样子，不影响已保存内容</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-brand-800">恢复默认</td>
                <td className="py-2.5 pr-4">立即写库</td>
                <td className="py-2.5">
                  清空装修回到默认搭配；<strong>已兑换的素材与建馆赠品都会保留</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-gray-600">
          之所以把「保存」做成一个明确动作，是为了让你能放心地反复试搭配 ——
          不必担心点错一下就改了馆。
        </p>
      </section>

      <section id="offering" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">七、装修与供奉是两回事</h2>
        <div className="mt-3 space-y-3 leading-7 text-gray-700">
          <p>
            装修只改变空间的<strong>外观</strong>：墙面、地面、挂饰、相框、字体。
            它<strong>不影响</strong>祭拜与供奉的任何规则。
          </p>
          <p>
            无论是免费馆还是付费馆，供奉体系完全一致：每日免费祭器按日补足、
            收费祭器购买后永久持有、献祭后进入冷却、次日或重新购买后恢复。
            装修得再华丽也不会让供奉变多或变少。
          </p>
        </div>
      </section>

      <section id="faq" className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">八、常见问题</h2>
        <div className="mt-4 space-y-4">
          {[
            {
              q: "我换了模板，为什么馆页没变？",
              a: "多半是没点「保存并完成装修」。换模板只改预览，保存后才写库。顶部若显示「有未保存的改动」，说明还没保存。",
            },
            {
              q: "我兑换了素材，为什么还是用不上？",
              a: "兑换只解锁使用权，还需要在对应分类里选中它并保存。若选中时仍提示未解锁，请刷新页面让权益状态同步。",
            },
            {
              q: "「恢复默认」会把建馆送的模板也清掉吗？",
              a: "不会。建馆赠品记录在独立字段里，恢复默认只重置你手动挑的内容，赠品与其零件永久保留。",
            },
            {
              q: "单买壁纸能让空间变成 3D 吗？",
              a: "不能。空间形态由模板决定，壁纸/地纹/挂饰只是空间内的材质与陈设。想要 3D 空间请选择立体模板。",
            },
            {
              q: "积分兑换和商城购买会重复扣费吗？",
              a: "不会。两条路落到同一份权益，只要拿到一次即永久可用，另一边会自动显示为已解锁。",
            },
            {
              q: "装修会消耗积分或影响祭祀吗？",
              a: "装修本身不消耗积分（只有兑换素材时才扣）。装修与供奉、祭祀记录完全独立，互不影响。",
            },
          ].map((f) => (
            <div key={f.q} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="text-[13px] font-medium text-brand-900">Q：{f.q}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-gray-600">A：{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-brand-200 pt-6">
        <Link
          href="/halls/guide"
          className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm text-white hover:bg-brand-700"
        >
          纪念馆创建指引
        </Link>
        <Link
          href="/clan/halls/guide"
          className="rounded-lg border border-brand-300 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          宗祠设立指引
        </Link>
      </div>
    </div>
  );
}
