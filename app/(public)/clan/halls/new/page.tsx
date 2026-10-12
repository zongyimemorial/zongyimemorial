import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import CreateFlowSteps from "@/components/site/CreateFlowSteps";
import NewClanHallForm from "@/components/clan/NewClanHallForm";

export const metadata = { title: "设立宗祠 · 宗忆堂" };

export default async function NewClanHallPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login?from=/clan/halls/new");

  /*
    实名状态以 DB 为准（与 action 的门禁同源）——
    session 里的 idVerified 可能是实名认证前的旧值。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { idVerified: true },
  });
  const verified = !!dbUser?.idVerified;

  return (
    <div className="container-page max-w-3xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">
          宗亲文化交流
        </Link>{" "}
        /{" "}
        <Link href="/clan/halls" className="hover:text-brand-700">
          设立宗祠
        </Link>{" "}
        / 新建
      </nav>

      <h1 className="text-2xl font-semibold text-brand-900">设立宗祠</h1>
      <p className="mt-1.5 text-sm text-brand-500">
        填写宗祠的基本信息。设立<span className="font-medium text-accent-600">免费</span>
        ，提交后经人工审核即对宗亲公开展示；装修素材免费的已足够端庄，精美素材可积分兑换或开通高级订阅。
      </p>

      {/*
        步骤条：把"填表只是第二步"这件事显式画出来。
        当前在第 2 步（实名）已完成、正在填资料 → current=1。
      */}
      <CreateFlowSteps
        kind="clan"
        steps={["实名认证", "填写资料", "装修宗祠", "完成"]}
        current={verified ? 1 : 0}
      />

      <p className="mt-3 text-xs text-brand-400">
        想先了解完整流程？
        <Link href="/clan/halls/guide" className="ml-1 font-medium text-accent-600 hover:underline">
          查看《宗祠设立指引》→
        </Link>
      </p>

      {err && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {err}
        </p>
      )}

      {!verified && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          设立宗祠需先完成实名认证。{" "}
          <Link href="/console/realname" className="font-medium underline">
            前往实名认证 →
          </Link>
        </div>
      )}

      {verified ? (
        <NewClanHallForm />
      ) : (
        <p className="mt-6 text-sm text-brand-500">完成实名认证后即可填写建馆材料。</p>
      )}
    </div>
  );
}
