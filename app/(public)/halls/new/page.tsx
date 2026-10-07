import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createMemorialHall } from "./actions";
import CreateFlowSteps from "@/components/site/CreateFlowSteps";

export const metadata = { title: "申请建馆 · 宗忆堂" };

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

const RELATIONS = ["亲属", "配偶", "子女", "父母", "兄弟姐妹", "朋友", "宗亲", "单位（逝者生平相关）"];

export default async function NewHallPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login?from=/halls/new");

  /*
    实名状态以 DB 为准（与 action 的门禁同源）——
    session 里的 idVerified 可能是实名认证前的旧值，
    拿它渲染表单会出现"页面说能填、提交却被拦"的落差。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { idVerified: true },
  });
  const verified = !!dbUser?.idVerified;

  return (
    <div className="container-page max-w-3xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/" className="hover:text-brand-700">
          首页
        </Link>{" "}
        /{" "}
        <Link href="/halls" className="hover:text-brand-700">
          纪念馆
        </Link>{" "}
        / 申请建馆
      </nav>

      <h1 className="text-2xl font-semibold text-brand-900">申请建馆</h1>
      <p className="mt-1.5 text-sm text-brand-500">
        建立<span className="font-medium text-accent-600">免费</span>
        ，且<span className="font-medium text-accent-600">永久保存</span>；需完成实名认证并提交建馆证明材料，
        人工审核通过后对公众展示。装修素材免费的已足够庄重，精美素材可积分兑换或开通高级订阅。
      </p>

      {/*
        步骤条与 HallBuyButton（旧付费通道弹窗）同一组 steps：
        「实名认证 → 提交材料 → 审核开通 → 装修纪念馆」。
        断言依赖这组文案（verify-guides §⑤），勿改字。
      */}
      <CreateFlowSteps
        kind="hall"
        steps={["实名认证", "提交材料", "审核开通", "装修纪念馆"]}
        current={verified ? 1 : 0}
      />

      <p className="mt-3 text-xs text-brand-400">
        想先了解完整流程？
        <Link href="/halls/guide" className="ml-1 font-medium text-accent-600 hover:underline">
          查看《纪念馆创建指引》→
        </Link>
      </p>

      {err && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {err}
        </p>
      )}

      {!verified && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          申请建馆需先完成实名认证。{" "}
          <Link href="/console/realname" className="font-medium underline">
            前往实名认证 →
          </Link>
        </div>
      )}

      <form action={createMemorialHall} className="mt-6 space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-brand-900">建馆申请 · 实名材料</h2>
          <p className="mb-4 mt-1 text-xs text-brand-400">
            依据《网络祭祀要求》（MZ/T 173—2025）：建馆须提供火化证明、经办人身份证、
            手机号及逝者关系，经专人审核后方可开通。材料仅用于合规审核，加密存储。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">逝者姓名 *</label>
              <input
                name="deceasedName"
                required
                maxLength={30}
                className={field}
                placeholder="将用作纪念馆名称"
                disabled={!verified}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">
                火化证明编号 / 火化证电子件编号 *
              </label>
              <input
                name="fireProof"
                required
                maxLength={60}
                className={field}
                disabled={!verified}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">与逝者关系 *</label>
              <select name="relation" required defaultValue="亲属" className={field} disabled={!verified}>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">
                经办人身份证号 *
              </label>
              <input
                name="applicantIdCard"
                required
                maxLength={18}
                className={field}
                placeholder="18位身份证号（加密存储）"
                disabled={!verified}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">经办人手机号 *</label>
              <input
                name="applicantPhone"
                required
                maxLength={11}
                className={field}
                placeholder="11位手机号"
                disabled={!verified}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!verified}
            className="rounded-md bg-brand-800 px-7 py-2.5 text-sm text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            免费提交建馆申请
          </button>
          <Link href="/halls" className="text-sm text-brand-500 hover:text-brand-700">
            返回纪念馆列表
          </Link>
        </div>
      </form>
    </div>
  );
}
