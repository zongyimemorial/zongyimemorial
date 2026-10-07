import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import CreateFlowSteps from "@/components/site/CreateFlowSteps";
import NewHallForm from "@/components/halls/NewHallForm";

export const metadata = { title: "申请建馆 · 宗忆堂" };

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

      {/* 通道感知建馆表单（标准 / 替代 / 特殊申述）。未实名时禁用交互由子组件内部自行约束。 */}
      {verified ? (
        <NewHallForm />
      ) : (
        <p className="mt-6 text-sm text-brand-500">完成实名认证后即可填写建馆材料。</p>
      )}
    </div>
  );
}
