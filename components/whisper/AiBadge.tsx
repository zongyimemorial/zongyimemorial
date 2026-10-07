/**
 * AI 生成内容「显式标识」徽标。
 *
 * 合规依据（强制，不可省略）：
 *   《人工智能生成合成内容标识办法》 + GB 45438-2025《网络安全技术
 *   人工智能生成合成内容标识方法》
 *   要求：AI 生成的文字/音频/图像内容必须带有**用户可感知**的显式标识。
 *
 * 隐式标识由服务端写入 WhisperMessage.aiLabel 字段（元数据溯源）。
 */

export default function AiBadge({
  label,
  compact = false,
  className = "",
}: {
  /** 溯源标签，来自服务端 aiLabel（隐式标识的可读形式） */
  label?: string | null;
  /** 紧凑模式：只显示「AI」小圆标 */
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span
        title={label ?? "本内容由 AI 生成，非真人回复"}
        className={
          "inline-flex h-4 items-center rounded bg-slate-200 px-1 text-[10px] font-medium leading-none text-slate-600 " +
          className
        }
      >
        AI
      </span>
    );
  }

  return (
    <span
      title={label ?? undefined}
      className={
        "inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] leading-none text-slate-600 " +
        className
      }
    >
      <span aria-hidden>◆</span>
      <span>AI 生成 · 非真人</span>
    </span>
  );
}

/** 页面级免责声明条（放在对话界面顶部，进入即见） */
export function AiDisclosureBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 " +
        className
      }
    >
      <p className="font-medium">请知悉：这里回应你的不是真人</p>
      <p className="mt-1 text-amber-700">
        以下内容由 AI 依据家人上传的生平资料生成，是用于追思怀念的纪念形象，
        不代表逝者本人的真实意愿或表达。所有对话均会被记录保存（不少于 6 个月）并带有 AI 生成标识。
      </p>
    </div>
  );
}
