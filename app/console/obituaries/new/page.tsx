import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obituaryQuotaLeft } from "@/lib/obituary";
import ObituaryForm from "@/components/console/ObituaryForm";
import { createObituary } from "../actions";

export const metadata = { title: "发布电子讣告" };

export default async function NewObituaryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [halls, quotaLeft] = await Promise.all([
    prisma.memorialHall.findMany({
      where: { ownerUserId: user.id!, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, deceasedName: true },
    }),
    obituaryQuotaLeft(user.id!),
  ]);

  return (
    <div className="container-page max-w-2xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">发布电子讣告</h1>
        <Link href="/console/obituaries" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回我的讣告
        </Link>
      </div>

      <p className="mb-5 text-sm text-brand-500">
        填写后将生成一个可分享的缅怀页链接，可直接发给亲友。发布即生效。
      </p>

      <ObituaryForm halls={halls} action={createObituary} quotaLeft={quotaLeft} />
    </div>
  );
}
