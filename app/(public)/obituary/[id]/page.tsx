import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { currentOrigin } from "@/lib/origin";
import { withShareToken, verifyShareToken } from "@/lib/share";
import { ShareBar } from "@/components/share/ShareBar";
import PasswordGate from "@/components/obituary/PasswordGate";

/**
 * 公开缅怀页（电子讣告）。
 *
 * 访问控制（三层，缺一不可）：
 *   1. 必须 `status === "published"`（下架即 notFound）；
 *   2. 免登录可看 —— 符合"生成链接发给亲友"的产品承诺；
 *   3. 设了密码则需持有效令牌（HMAC 绑死本讣告路径，见 api/obituary/[id]/unlock）。
 *
 * SEO：公开且未加密才可索引；私密/加密一律 noindex（与 halls/[id] 同口径）。
 * ⚠️ 判据：不可访问时返回 `notFound()` —— 注意它返回 **200**，不要靠状态码判 404。
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ob = await prisma.obituary.findUnique({
    where: { id },
    select: { deceasedName: true, status: true, isPublic: true, passwordHash: true, biography: true },
  });
  // 不存在 / 已下架 → 泛标题（不泄露任何信息）
  if (!ob || ob.status !== "published") return { title: "电子讣告" };

  const years =
    ob.passwordHash == null && ob.biography
      ? ob.biography.slice(0, 120)
      : `沉痛悼念 ${ob.deceasedName}。`;

  return {
    title: `${ob.deceasedName} · 讣告`,
    description: years,
    // 私密或加密的讣告不进搜索引擎
    robots: ob.isPublic && !ob.passwordHash ? undefined : { index: false, follow: false },
    alternates: { canonical: `/obituary/${id}` },
    openGraph: { title: `${ob.deceasedName} · 讣告` },
  };
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export default async function ObituaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ob = await prisma.obituary.findUnique({
    where: { id },
    include: {
      hall: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  // 下架 / 不存在 → 404
  if (!ob || ob.status !== "published") notFound();

  // 密码档：校验 cookie 令牌（绑死本讣告路径）
  if (ob.passwordHash) {
    const jar = await cookies();
    const token = jar.get("obituary_access")?.value;
    const ok = await verifyShareToken(token, `/obituary/${id}`, "obituary");
    if (!ok) {
      return <PasswordGate obituaryId={id} deceasedName={ob.deceasedName} />;
    }
  }

  // 分享链接（内测期免口令）
  const shareUrl = `${(await currentOrigin()) ?? ""}${await withShareToken(`/obituary/${id}`, "obituary")}`;
  const years =
    ob.birthDate || ob.deathDate
      ? `（${ob.birthDate ? ob.birthDate.getFullYear() : "?"} - ${ob.deathDate ? ob.deathDate.getFullYear() : "?"}）`
      : "";

  return (
    // data-obituary-view 是"已放行正文"的**唯一**锚点：
    // 未解锁时这里渲染的是 PasswordGate（它在 container-page 里），
    // 因此它的存在即证明密码校验已通过。验收脚本 §6 靠它判定解锁成功 ——
    // 不要改用"等固定毫秒数"来判，那是时序假象的来源。
    <article className="mx-auto max-w-2xl px-4 py-12" data-obituary-view>
      {/* 讣告头 */}
      <header className="mb-8 border-b border-brand-200 pb-6 text-center">
        <div className="mb-2 text-4xl">🕯️</div>
        <h1 className="text-2xl font-semibold text-brand-900" data-obituary-name>
          {ob.deceasedName}
        </h1>
        {years && <p className="mt-1 text-brand-500">{years}</p>}
        <p className="mt-3 text-sm text-brand-400">讣 告</p>
      </header>

      {/* 生平 */}
      {ob.biography && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-brand-800">生平简介</h2>
          <p className="whitespace-pre-wrap leading-7 text-brand-700" data-obituary-bio>
            {ob.biography}
          </p>
        </section>
      )}

      {/* 告别仪式信息 */}
      {ob.funeralInfo && (
        <section className="mb-8 rounded-lg border border-brand-200 bg-gray-50 p-4">
          <h2 className="mb-2 text-sm font-medium text-brand-800">告别仪式</h2>
          <p className="whitespace-pre-wrap leading-7 text-brand-700">{ob.funeralInfo}</p>
        </section>
      )}

      {/* 治丧联系 */}
      {ob.contactInfo && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-brand-800">治丧联系</h2>
          <p className="whitespace-pre-wrap leading-7 text-brand-700">{ob.contactInfo}</p>
        </section>
      )}

      {/* 关联纪念馆入口 */}
      {ob.hall && (
        <div className="mb-8">
          <Link
            href={`/halls/${ob.hall.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent-300 px-4 py-2 text-sm text-accent-700 hover:bg-accent-50"
          >
            进入 {ob.hall.name} 纪念馆 →
          </Link>
        </div>
      )}

      {/* 留言区 */}
      {ob.allowMessages && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-brand-800">
            亲友留言{ob.messages.length > 0 ? `（${ob.messages.length}）` : ""}
          </h2>
          {ob.messages.length === 0 ? (
            <p className="text-sm text-brand-400" data-obituary-no-messages>
              暂无留言。
            </p>
          ) : (
            <ul className="space-y-3">
              {ob.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-3">
                  <div className="mb-1 text-xs text-brand-400">
                    {m.displayName} · {m.createdAt.toLocaleDateString("zh-CN")}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-brand-700">{m.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 分享 */}
      <div className="border-t border-brand-200 pt-6">
        <ShareBar
          url={shareUrl}
          title={`${ob.deceasedName} · 讣告`}
          summary="诚挚邀请您前来缅怀"
          scope="obituary"
        />
      </div>
    </article>
  );
}
