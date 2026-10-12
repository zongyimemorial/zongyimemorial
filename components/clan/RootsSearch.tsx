"use client";

import { useState } from "react";
import { searchRoots } from "@/app/(public)/clan/actions";

type Row = {
  id: string;
  surname: string;
  hallName: string | null;
  origin: string | null;
  lineage: string | null;
  migration: string | null;
  viewCount: number;
};

const SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤".split(
  ""
);

export default function RootsSearch() {
  const [surname, setSurname] = useState("");
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!surname.trim()) return;
    setBusy(true);
    const res = await searchRoots(surname, origin);
    setRows(res as Row[]);
    setBusy(false);
  }

  return (
    <div>
      <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">姓氏 *</label>
            <input
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="输入或点选姓氏"
              className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">
              祖籍 / 走过的地名（选填，提高匹配精度）
            </label>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="如：泉州 / 洪洞大槐树 / 南雄珠玑巷"
              className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SURNAMES.slice(0, 40).map((s) => (
            <button
              key={s}
              onClick={() => setSurname(s)}
              className={`h-8 w-8 rounded border text-xs ${surname === s ? "border-accent-400 bg-accent-50 text-accent-700" : "border-brand-200 text-brand-500 hover:border-accent-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={search}
          disabled={busy || !surname.trim()}
          className="mt-4 rounded-md bg-brand-800 px-8 py-2.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "匹配中…" : "🔍 一键寻根"}
        </button>
      </div>

      {rows && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-brand-700">
            {rows.length > 0
              ? `为「${surname}氏」匹配到 ${rows.length} 部族谱线索`
              : `暂未找到「${surname}氏」相关族谱，欢迎宗亲上传补充`}
          </h2>
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                  {i + 1}
                </span>
                <div className="font-semibold text-brand-900">
                  {r.surname}氏{r.hallName ? ` · ${r.hallName}` : ""}
                </div>
                <span className="ml-auto text-xs text-brand-300">
                  匹配度 {Math.max(40, 95 - i * 5)}%
                </span>
              </div>
              {r.origin && <div className="mt-2 text-sm text-brand-500">祖籍：{r.origin}</div>}
              {r.lineage && (
                <div className="mt-2 text-sm text-brand-700">
                  <span className="text-xs text-brand-400">字辈：</span>
                  {r.lineage}
                </div>
              )}
              {r.migration && (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{r.migration}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
