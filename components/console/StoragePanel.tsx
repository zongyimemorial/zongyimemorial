"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fubFromFen } from "@/lib/fortune";

/**
 * 存储空间面板（纪念馆 / 宗祠共用）
 *
 * 数据全部由页面（Server Component）算好传入 —— 组件不自己读库，
 * 避免"面板里算一套口径、上传接口算另一套"的分叉（本仓库的老毛病）。
 * 唯一的交互是"升级/续费"：调页面传入的 action 建单，再跳转账页。
 */
export type StoragePlanView = {
  slug: string;
  name: string;
  gb: number;
  priceFen: number;
};

export type StoragePanelProps = {
  /** 已用字节 */
  used: number;
  /** 有效总配额（免费 + 订阅）字节 */
  quota: number;
  /** 免费额度字节 */
  freeQuota: number;
  /** 已购容量包字节（订阅有效期内） */
  subBytes: number;
  /** 订阅是否有效 */
  active: boolean;
  /** 到期日 ISO 字符串；无则 null */
  until: string | null;
  /** 当前生效容量包名（如「标准存储 10GB/年」）；无则 null */
  activePlanName: string | null;
  /** 免费额度文案（如「建馆赠送 1GB」） */
  freeLabel: string;
  /** 可购买的容量包 */
  plans: StoragePlanView[];
  /**
   * 建单 Server Action（**直接传引用，不要传闭包**）。
   * 服务端组件不能把 `(slug) => action(hallId, slug)` 这类内联函数传给客户端组件
   * （报 "Functions cannot be passed directly to Client Components"）；
   * 必须传 `"use server"` 导出的函数本身，再由这里带上 hallId 调用。
   */
  createOrder: (
    hallId: string,
    planSlug: string,
  ) => Promise<{ ok: boolean; orderNo?: string; error?: string }>;
  /** 目标馆 id（与 createOrder 一起传给 action） */
  hallId: string;
};

function fmtBytes(n: number): string {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  if (n >= GB) return `${(n / GB).toFixed(n % GB === 0 ? 0 : 2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StoragePanel({
  used,
  quota,
  freeQuota,
  subBytes,
  active,
  until,
  activePlanName,
  freeLabel,
  plans,
  createOrder: createOrderAction,
  hallId,
}: StoragePanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const nearFull = pct >= 85;

  async function buy(slug: string) {
    setBusy(slug);
    setErr("");
    try {
      const res = await createOrderAction(hallId, slug);
      if (res.ok && res.orderNo) {
        router.push(`/pay/${res.orderNo}`);
        return;
      }
      setErr(res.error || "下单失败");
    } catch {
      setErr("网络错误，请重试");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">存储空间</h2>
          <p className="mt-1 text-xs text-brand-400">
            照片、视频等资料占用空间。{freeLabel}，升级可按年扩容，已存资料不受到期影响。
            开通任一大包即解锁<b className="font-semibold text-brand-600">单张 20MB 高清原片</b>上传（原 8MB）。
          </p>
        </div>
        <span className="text-xs text-brand-500">
          已用 {fmtBytes(used)} / {fmtBytes(quota)}
        </span>
      </div>

      {/* 进度条 */}
      <div className="mt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={
              "h-full rounded-full transition-all " +
              (nearFull ? "bg-red-500" : "bg-accent-500")
            }
            style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className={nearFull ? "font-medium text-red-600" : "text-brand-500"}>
            {pct}% 已使用
          </span>
          <span className="text-brand-400">
            免费额度 {fmtBytes(freeQuota)}
            {subBytes > 0 && <> + 容量包 {fmtBytes(subBytes)}</>}
          </span>
          {active ? (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
              容量包生效中{activePlanName ? ` · ${activePlanName}` : ""}
              {until ? `（至 ${fmtDate(until)}）` : ""}
            </span>
          ) : until ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
              容量包已于 {fmtDate(until)} 到期 · 续费可恢复
            </span>
          ) : (
            <span className="text-brand-400">当前为免费额度</span>
          )}
        </div>
        {nearFull && (
          <p className="mt-2 text-xs text-red-600">
            空间即将用尽，上传可能被拒绝。建议升级或续费容量包。
          </p>
        )}
      </div>

      {/* 升级档位 */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = active && subBytes === p.gb * 1024 ** 3;
          return (
            <div
              key={p.slug}
              className={
                "flex flex-col rounded-lg border p-3 " +
                (isCurrent ? "border-accent-300 bg-accent-50/50" : "border-brand-200 bg-brand-50/30")
              }
            >
              <div className="text-sm font-medium text-brand-900">{p.gb} GB / 年</div>
              <div className="mt-1 text-lg font-bold text-brand-700">
                {fubFromFen(p.priceFen)} 福币
              </div>
              <div className="mt-0.5 text-[11px] text-brand-400">
                合计 {fmtBytes(freeQuota + p.gb * 1024 ** 3)}
              </div>
              <button
                type="button"
                onClick={() => buy(p.slug)}
                disabled={busy !== null}
                className={
                  "mt-2 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 " +
                  (isCurrent ? "bg-accent-600 hover:bg-accent-700" : "bg-brand-800 hover:bg-brand-700")
                }
              >
                {busy === p.slug ? "处理中…" : isCurrent ? "续费一年" : active ? "升级到此档" : "开通"}
              </button>
            </div>
          );
        })}
      </div>

      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
      <p className="mt-3 text-xs text-brand-400">
        容量按年订阅，到期后自动回退到免费额度，已上传的资料不会被删除，仅限制新上传。
        订阅期内可上传单张 20MB 高清原片；到期后新上传回到 8MB 上限，原有照片不受影响。
      </p>
    </section>
  );
}
