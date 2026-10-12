/**
 * 建馆 / 设立宗祠的步骤条。
 *
 * 用途：把"填表 → 提交 → 装修"这条链路显式画出来。
 * 表单页本身只有一堆输入框，用户容易以为"提交完就结束了"，
 * 实际上提交后还要进入装修工坊挑模板、点保存，才算真正建好。
 *
 * 这是个**纯展示**组件（服务端可用，不需要 "use client"）——
 * 它不做路由跳转、不管状态，只负责把当前处于哪一步画清楚。
 */
export type FlowStep = string;

export default function CreateFlowSteps({
  steps,
  current,
  kind = "hall",
}: {
  steps: FlowStep[];
  /** 当前步骤下标（0-based） */
  current: number;
  kind?: "hall" | "clan";
}) {
  const accent = kind === "clan" ? "bg-accent-600" : "bg-brand-800";
  return (
    <ol
      data-create-flow={kind}
      className="mt-4 flex flex-wrap items-center gap-y-2 text-[12px]"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center">
            <span
              className={
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 " +
                (active
                  ? `${accent} text-white`
                  : done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-brand-500")
              }
            >
              <span
                className={
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] " +
                  (active ? "bg-white/25 text-white" : done ? "bg-emerald-600 text-white" : "bg-brand-100/70 text-brand-500")
                }
              >
                {done ? "✓" : i + 1}
              </span>
              {s}
            </span>
            {i < steps.length - 1 && <span className="mx-1.5 text-brand-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
