"use client";

import { useMemo, useState } from "react";
import GenealogyChart from "@/components/clan/GenealogyChart";
import {
  ALL_CHART_TYPES,
  CHART_META,
  CHART_NOTATION,
  SAMPLE_MEMBERS,
  chartStats,
  parseMembers,
  validateChart,
  type ChartConfig,
  type ChartType,
  type MemberRow,
} from "@/lib/genealogy-chart";
import { saveGenealogyChart, unlockChartType } from "@/app/(public)/clan/genealogy/[id]/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

type Msg = { ok: boolean; text: string } | null;

/** 把结构化成员序列化为「世代|姓名|关系|备注」行文本 */
function toLines(members: MemberRow[]): string {
  return members.map((m) => [m.gen, m.name, m.relation ?? "", m.note ?? ""].join("|")).join("\n");
}

/** 解析行文本（容忍全角分隔符） */
function fromLines(text: string): MemberRow[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [gen, name, relation, ...rest] = l.split(/[|｜,，\t]/);
      return {
        gen: Number(String(gen ?? "").trim()) || 0,
        name: String(name ?? "").trim(),
        relation: String(relation ?? "").trim() || undefined,
        note: rest.join("，").trim() || undefined,
      };
    })
    .filter((m) => m.gen > 0 && m.name);
}

export default function GenealogyDesigner({
  genealogyId,
  surname,
  defaultType,
  defaultConfig,
  initialMembers,
  isPremium,
  unlocked,
  userPoints,
}: {
  genealogyId: string;
  surname: string;
  defaultType: ChartType;
  defaultConfig: Partial<ChartConfig>;
  initialMembers: MemberRow[];
  isPremium: boolean;
  unlocked: string[];
  userPoints: number;
}) {
  const [type, setType] = useState<ChartType>(defaultType);
  const [unlockedList, setUnlockedList] = useState<string[]>(unlocked);
  const [members, setMembers] = useState<MemberRow[]>(
    initialMembers.length ? initialMembers : SAMPLE_MEMBERS,
  );
  const [lines, setLines] = useState<string>(toLines(initialMembers.length ? initialMembers : SAMPLE_MEMBERS));
  const [mode, setMode] = useState<"lines" | "rows">("lines");
  const [title, setTitle] = useState(defaultConfig.title ?? `${surname}氏族谱世系图`);
  const [hallName, setHallName] = useState(defaultConfig.hallName ?? "");
  const [origin, setOrigin] = useState(defaultConfig.origin ?? "");
  const [showNotes, setShowNotes] = useState(defaultConfig.showNotes !== false);
  const [showGenLabels, setShowGenLabels] = useState(defaultConfig.showGenLabels !== false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const config: ChartConfig = { type, title, hallName, origin, showNotes, showGenLabels };
  const stats = useMemo(() => chartStats(members), [members]);
  const check = useMemo(() => validateChart(members), [members]);
  const meta = CHART_META[type];

  function isTypeLocked(t: ChartType) {
    const m = CHART_META[t];
    if (m.tier === "free") return false;
    if (isPremium) return false;
    return !unlockedList.includes(t);
  }

  function applyLines(text: string) {
    setLines(text);
    setMembers(fromLines(text));
  }

  function updateRow(i: number, patch: Partial<MemberRow>) {
    const next = members.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    setMembers(next);
    setLines(toLines(next));
  }

  function addRow() {
    const lastGen = members.length ? Math.max(...members.map((m) => m.gen)) : 1;
    const next = [...members, { gen: lastGen, name: "新成员", relation: "", note: "" }];
    setMembers(next);
    setLines(toLines(next));
  }

  function removeRow(i: number) {
    const next = members.filter((_, idx) => idx !== i);
    setMembers(next);
    setLines(toLines(next));
  }

  async function onSave() {
    if (!check.ok) {
      setMsg({ ok: false, text: check.errors[0] });
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("genealogyId", genealogyId);
    fd.set("chartType", type);
    fd.set("membersJson", JSON.stringify(members));
    fd.set("title", title);
    fd.set("hallName", hallName);
    fd.set("origin", origin);
    fd.set("showNotes", showNotes ? "1" : "0");
    fd.set("showGenLabels", showGenLabels ? "1" : "0");
    const res = await saveGenealogyChart(fd);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已保存" : "保存失败") });
  }

  async function onUnlock(t: ChartType) {
    setBusy(true);
    const fd = new FormData();
    fd.set("genealogyId", genealogyId);
    fd.set("chartType", t);
    const res = await unlockChartType(fd);
    setBusy(false);
    if (res.ok) {
      setUnlockedList((l) => [...l, t]);
      setType(t);
    }
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已解锁" : "解锁失败") });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ---------------- 左：设计面板 ---------------- */}
      <div className="space-y-5">
        {/* 步骤 1：选版式 */}
        <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-800 text-[11px] text-white">
              1
            </span>
            <h2 className="text-sm font-semibold text-brand-900">选择版式</h2>
          </div>
          <p className="mt-1 text-xs text-brand-400">
            四种传统体例免费使用；三种精美版式可积分兑换或开通高级订阅。
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {ALL_CHART_TYPES.map((t) => {
              const m = CHART_META[t];
              const locked = isTypeLocked(t);
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  title={locked ? "该版式为精美收费版式，可预览后解锁使用" : undefined}
                  className={
                    "rounded-lg border p-3 text-left transition " +
                    (active
                      ? "border-accent-500 ring-2 ring-accent-200"
                      : locked
                        ? "border-brand-200 opacity-80 hover:border-amber-300"
                        : "border-brand-200 hover:border-accent-300")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-brand-900">{m.name}</span>
                    {m.tier === "free" ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">免费</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                        {locked ? "需订阅" : "已解锁"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-brand-400">{m.alias}</div>
                </button>
              );
            })}
          </div>

          <p className="mt-3 rounded bg-brand-50/60 p-2.5 text-xs leading-5 text-brand-500">
            <span className="font-medium text-brand-700">{meta.name}</span>：{meta.desc}
          </p>

          {isTypeLocked(type) && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs leading-5 text-amber-700">
                当前预览的是精美收费版式「{meta.name}」，{isPremium
                  ? "你的高级订阅可直接使用。"
                  : `需 ${600} 积分兑换或开通高级订阅后方可保存。`}
              </p>
              <button
                type="button"
                onClick={() => onUnlock(type)}
                disabled={busy}
                className="mt-2 w-full rounded-md border border-amber-300 bg-brand-100/70 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                开通高级订阅解锁精美版式 →
              </button>
            </div>
          )}
        </section>

        {/* 步骤 2：录入世系 */}
        <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-800 text-[11px] text-white">
                2
              </span>
              <h2 className="text-sm font-semibold text-brand-900">录入世系</h2>
            </div>
            <div className="flex gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setMode("lines")}
                className={
                  "rounded px-2 py-1 " +
                  (mode === "lines" ? "bg-brand-800 text-white" : "border border-brand-200 text-brand-600")
                }
              >
                行文本
              </button>
              <button
                type="button"
                onClick={() => setMode("rows")}
                className={
                  "rounded px-2 py-1 " +
                  (mode === "rows" ? "bg-brand-800 text-white" : "border border-brand-200 text-brand-600")
                }
              >
                逐条编辑
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-brand-400">
            每行一位：「世代 | 姓名 | 关系 | 备注」。世代须从 1 起且不跳号。
          </p>

          {mode === "lines" ? (
            <textarea
              rows={12}
              value={lines}
              onChange={(e) => applyLines(e.target.value)}
              className={`${field} mt-3 font-mono text-xs`}
              placeholder={"1|李公讳广|始祖|唐陇西郡公\n2|李敢|长子|袭关内侯\n2|李氏|女|适河东王氏"}
            />
          ) : (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {members.map((m, i) => (
                <div key={i} className="grid grid-cols-[36px_1fr_1fr_1fr_28px] items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={m.gen}
                    onChange={(e) => updateRow(i, { gen: Number(e.target.value) || 0 })}
                    className="rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                  <input
                    value={m.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="姓名"
                    className="rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                  <input
                    value={m.relation ?? ""}
                    onChange={(e) => updateRow(i, { relation: e.target.value })}
                    placeholder="关系（长子/女）"
                    className="rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                  <input
                    value={m.note ?? ""}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    placeholder="备注（适某地某姓/止/殇）"
                    className="rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded bg-red-50 px-1 py-1 text-[11px] text-red-500 hover:bg-red-100"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="w-full rounded border border-dashed border-brand-300 py-1.5 text-xs text-brand-500 hover:border-accent-300"
              >
                + 添加成员
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded bg-brand-50 px-2 py-1 text-brand-600">
              共 {stats.total} 人 · {stats.generations} 世
            </span>
            {check.ok ? (
              <span className="text-emerald-600">数据校验通过</span>
            ) : (
              <span className="text-red-500">{check.errors[0]}</span>
            )}
            <button
              type="button"
              onClick={() => applyLines(toLines(SAMPLE_MEMBERS))}
              className="text-brand-400 hover:text-brand-700"
            >
              载入示例
            </button>
          </div>
        </section>

        {/* 步骤 3：图面设置 */}
        <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-800 text-[11px] text-white">
              3
            </span>
            <h2 className="text-sm font-semibold text-brand-900">图面设置</h2>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">图名</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">堂号</label>
                <input
                  value={hallName}
                  onChange={(e) => setHallName(e.target.value)}
                  className={field}
                  placeholder="如：陇西堂"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">郡望 / 始迁地</label>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className={field}
                  placeholder="如：甘肃陇西"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-brand-600">
              <input
                type="checkbox"
                checked={showNotes}
                onChange={(e) => setShowNotes(e.target.checked)}
              />
              显示生平备注
            </label>
            <label className="flex items-center gap-2 text-xs text-brand-600">
              <input
                type="checkbox"
                checked={showGenLabels}
                onChange={(e) => setShowGenLabels(e.target.checked)}
              />
              显示世代标签
            </label>
          </div>
        </section>

        {/* 步骤 4：保存与导出 */}
        <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-800 text-[11px] text-white">
              4
            </span>
            <h2 className="text-sm font-semibold text-brand-900">保存与导出</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={busy || !check.ok}
              className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存族谱图"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50"
            >
              打印 / 导出 PDF
            </button>
          </div>
          {msg && (
            <p className={"mt-3 text-sm " + (msg.ok ? "text-green-600" : "text-red-500")}>{msg.text}</p>
          )}
          <div className="mt-4 rounded bg-brand-50/60 p-3">
            <div className="mb-1 text-xs font-medium text-brand-700">族谱书写规范</div>
            <ul className="space-y-1 text-[11px] leading-5 text-brand-500">
              {CHART_NOTATION.map((n) => (
                <li key={n.mark}>
                  <span className="text-brand-700">{n.mark}</span> · {n.desc}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ---------------- 右：实时预览 ---------------- */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-900">实时预览</h2>
          <span className="text-xs text-brand-400">
            {meta.name} · {stats.generations} 世 {stats.total} 人
          </span>
        </div>
        <div className="max-h-[80vh] overflow-auto rounded-lg border border-brand-200 bg-gray-50 p-2">
          <GenealogyChart members={members} config={config} />
        </div>
      </div>
    </div>
  );
}
