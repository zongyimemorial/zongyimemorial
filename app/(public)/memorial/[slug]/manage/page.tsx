import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermForUser } from "@/lib/permissions";
import {
  CATEGORY_LABEL,
  giftSuite,
  GIFT_SUITE_CHOICES,
  coupletOf,
} from "@/lib/memorial";
import MemorialDecorForm from "./MemorialDecorForm";

export const metadata = { title: "馆务管理 · 公益纪念堂" };

/** Next 动态路由 params 不自动解码中文 slug */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function MemorialManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: raw } = await params;
  const slug = safeDecode(raw);

  const user = await getCurrentUser();
  // 仅公益纪念审核人员（admin / super_admin / 授权 editor）可进入；未登录回登录页，无权限回控制台
  if (!user) redirect("/login");
  if (!hasPermForUser(user.role, user.permissions, "memorial_review")) redirect("/console");

  const memorial = await prisma.publicMemorial.findUnique({ where: { slug } });
  if (!memorial) notFound();

  const suite = giftSuite(memorial.giftSuiteId);
  const couplet = coupletOf(memorial.couplet);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">馆务管理</h1>
          <p className="mt-1 text-sm text-brand-500">
            {memorial.name}
            <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
              {CATEGORY_LABEL[memorial.category]} · 公益纪念堂
            </span>
          </p>
        </div>
        <Link
          href={`/memorial/${memorial.slug}`}
          target="_blank"
          className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
        >
          查看详情页 →
        </Link>
      </header>

      <div className="mb-6 rounded-lg border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-xs text-brand-600">
        当前赠礼方案：<b className="text-brand-800">{suite.name}</b>（尊享层）· 旗舰存储 {memorial.giftStorageGb}GB/年。
        公益馆装修由平台统一配置，公众详情页零可见、零付费。
      </div>

      <MemorialDecorForm
        slug={memorial.slug}
        giftSuiteId={memorial.giftSuiteId}
        suiteChoices={GIFT_SUITE_CHOICES}
        portraitUrl={memorial.portraitUrl}
        couplet={couplet}
      />

      <div className="mt-8 border-t border-brand-200 pt-6">
        <Link href="/admin/memorial-review" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回公益纪念审核
        </Link>
      </div>
    </div>
  );
}
