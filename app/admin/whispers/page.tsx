import { PLAN_SPECS, SINGLE_PACK, CLONE_PASS, MEMORIAL_VIDEO } from "@/lib/whisper";

export const metadata = { title: "悄悄话经营测算" };

/**
 * 午夜悄悄话 · 经营数据（内部，仅管理后台可见）
 *
 * ⚠️ 本页展示成本与毛利等经营数据，禁止将 note/成本字段渲染到前台页面。
 * 定价原则：按全云端单位成本、用户满耗（用完全部语音分钟）口径，毛利 ≥30%。
 */

/** 全云端单位成本（元/分钟），来源：docs/午夜悄悄话_收费标准与成本测算.md（2026-09 实测询价） */
const UNIT_COST = {
  asr: 0.03, // ASR 语音识别
  llm: 0.024, // LLM 文本生成
  ttsCloud: 0.115, // TTS 语音合成（云端）
  ttsSelfBuild: 0.017, // TTS（自建 CosyVoice 3，阶段二）
};
const TOTAL_PER_MIN = UNIT_COST.asr + UNIT_COST.llm + UNIT_COST.ttsCloud; // ≈¥0.169
const TOTAL_PER_MIN_SELF = UNIT_COST.asr + UNIT_COST.llm + UNIT_COST.ttsSelfBuild; // ≈¥0.071

/** 各档满耗成本（元）。长夜版视频已拆出单卖，不再含视频预留。 */
const FULL_COST: Record<string, number> = {
  free: 2,
  basic: 300 * TOTAL_PER_MIN, // ≈¥50.8
  premium: 800 * TOTAL_PER_MIN, // ≈¥135.2（视频已拆出单卖）
  single: 10 * TOTAL_PER_MIN, // ≈¥1.69
  clone: 138, // 火山音色训练单次成本
};

function yuan(fen: number): string {
  return `¥${(fen / 100).toFixed(fen % 100 === 0 ? 0 : 2)}`;
}
function pct(price: number, cost: number): string {
  if (price <= 0) return "—";
  return `${Math.round(((price / 100 - cost) / (price / 100)) * 100)}%`;
}

export default function WhisperOpsPage() {
  const plans = Object.values(PLAN_SPECS);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-brand-900">午夜悄悄话 · 经营测算</h1>
      <p className="mb-6 text-sm text-brand-500">
        定价、成本与毛利内部数据。前台收费页只展示价格与权益，不展示本页任何内容。
        长夜版（¥199）已不含纪念短片：视频拆为单条加购（¥49/条，毛利≈69%），订阅毛利与视频毛利分别核算。
      </p>

      {/* 单位成本模型 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">单位成本模型（全云端）</h2>
        <div className="mt-3 grid gap-3 text-xs text-brand-600 sm:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            ASR 语音识别<br />
            <b className="text-brand-900">¥{UNIT_COST.asr.toFixed(3)}/分钟</b>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            LLM 文本生成<br />
            <b className="text-brand-900">¥{UNIT_COST.llm.toFixed(3)}/分钟</b>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            TTS 语音合成<br />
            <b className="text-brand-900">¥{UNIT_COST.ttsCloud.toFixed(3)}/分钟</b>
          </div>
          <div className="rounded-lg bg-brand-800 p-3 text-white">
            合计 / 分钟<br />
            <b>≈¥{TOTAL_PER_MIN.toFixed(3)}</b>
            <span className="block text-[10px] opacity-70">
              自建 TTS 后 ≈¥{TOTAL_PER_MIN_SELF.toFixed(3)}（阶段二）
            </span>
          </div>
        </div>
      </section>

      {/* 套餐定价与毛利 */}
      <section className="mt-6 overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">订阅套餐 · 定价与毛利（满耗口径）</h2>
        <table className="mt-3 w-full min-w-[760px] text-left text-xs">
          <thead className="text-brand-400">
            <tr className="border-b border-brand-200">
              <th className="py-2">档位</th>
              <th className="py-2">定价/月</th>
              <th className="py-2">语音分钟</th>
              <th className="py-2">满耗成本</th>
              <th className="py-2">毛利</th>
              <th className="py-2">内部备注</th>
            </tr>
          </thead>
          <tbody className="text-brand-700">
            {plans.map((p) => (
              <tr key={p.plan} className="border-b border-gray-50">
                <td className="py-2.5 font-medium text-brand-900">{p.name}</td>
                <td className="py-2.5">{p.priceFen === 0 ? "免费" : yuan(p.priceFen)}</td>
                <td className="py-2.5">{p.monthlyMins > 0 ? `${p.monthlyMins} 分钟` : "不含"}</td>
                <td className="py-2.5">≈{yuan(Math.round(FULL_COST[p.plan] * 100))}</td>
                <td className="py-2.5">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 font-semibold " +
                      (p.priceFen > 0 && ((p.priceFen / 100 - FULL_COST[p.plan]) / (p.priceFen / 100)) >= 0.3
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700")
                    }
                  >
                    {pct(p.priceFen, FULL_COST[p.plan])}
                  </span>
                </td>
                <td className="py-2.5 text-brand-500">{p.note}</td>
              </tr>
            ))}
            <tr className="border-b border-gray-50">
              <td className="py-2.5 font-medium text-brand-900">按次包（{SINGLE_PACK.minutes} 分钟）</td>
              <td className="py-2.5">{yuan(SINGLE_PACK.priceFen)}</td>
              <td className="py-2.5">{SINGLE_PACK.minutes} 分钟</td>
              <td className="py-2.5">≈{yuan(Math.round(FULL_COST.single * 100))}</td>
              <td className="py-2.5">
                <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
                  {pct(SINGLE_PACK.priceFen, FULL_COST.single)}
                </span>
              </td>
              <td className="py-2.5 text-brand-500">{SINGLE_PACK.note}</td>
            </tr>
            <tr>
              <td className="py-2.5 font-medium text-brand-900">声音克隆资格（一次性工本费）</td>
              <td className="py-2.5">{yuan(CLONE_PASS.priceFen)}</td>
              <td className="py-2.5">—</td>
              <td className="py-2.5">
                <span className="text-brand-400">由订阅档承载</span>
              </td>
              <td className="py-2.5">
                <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                  漏斗工本费
                </span>
              </td>
              <td className="py-2.5 text-brand-500">{CLONE_PASS.note}</td>
            </tr>
            <tr>
              <td className="py-2.5 font-medium text-brand-900">纪念短片（单条加购）</td>
              <td className="py-2.5">{yuan(MEMORIAL_VIDEO.priceFen)}</td>
              <td className="py-2.5">—</td>
              <td className="py-2.5">{yuan(MEMORIAL_VIDEO.costYuan * 100)}</td>
              <td className="py-2.5">
                <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
                  {pct(MEMORIAL_VIDEO.priceFen, MEMORIAL_VIDEO.costYuan)}
                </span>
              </td>
              <td className="py-2.5 text-brand-500">{MEMORIAL_VIDEO.note}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-brand-400">
          毛利 =（定价 − 满耗成本）/ 定价，按用户当月用完全部语音分钟的**最坏口径**计算；
          实际用户典型消耗约 60%，真实毛利显著更高。定价底线：满耗毛利 ≥30%。
        </p>
      </section>
    </div>
  );
}
