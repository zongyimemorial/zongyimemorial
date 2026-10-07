import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";

export const metadata = { title: "数字纪念馆" };

export default async function HallsPage() {
  const halls = await prisma.memorialHall.findMany({
    where: { isPublic: true, status: "active" },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="container-page max-w-5xl py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-semibold text-brand-900">数字纪念馆</h1>
        <p className="mx-auto mt-3 max-w-2xl text-brand-500">
          以数字方式，为逝者建立一个随时可达的纪念空间。上传生平与照片，
          亲友可远程追思、献花、点灯与留言。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
          >
            注册并创建纪念馆
          </Link>
          <Link
            href="/halls/new"
            className="rounded-md border border-brand-700 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            免费申请建馆
          </Link>
        </div>
        <p className="mt-4 text-sm text-brand-500">
          还不知道怎么建馆？
          <Link
            href="/halls/guide"
            className="font-medium text-accent-600 hover:underline"
          >
            查看完整创建引导 →
          </Link>
        </p>
      </header>

      {/* 使用流程 */}
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h2 className="text-center text-xl font-semibold text-brand-900">
          三步建立纪念空间
        </h2>
        <Image
          src="/assets/illus-process.jpg"
          alt="创建流程"
          width={1280}
          height={853}
          className="mx-auto mt-6 h-auto w-full max-w-2xl"
        />
        <div className="mt-6 grid gap-5 text-center md:grid-cols-3">
          <Step n="1" t="注册并实名" d="完成实名，守护真实的缅怀。" />
          <Step n="2" t="填写生平" d="录入姓名、生卒年与简介，上传照片。" />
          <Step n="3" t="邀请亲友" d="分享链接，亲友远程献花点灯留言。" />
        </div>
      </section>

      {/* 模板展示 */}
      <section className="mt-12">
        <h2 className="mb-5 text-xl font-semibold text-brand-900">
          纪念馆能包含什么
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature t="生平简介" d="庄重得体的生平记录，可委托专业文案代写。" />
          <Feature t="照片与影像" d="收录老照片与纪念视频，让音容长留。" />
          <Feature t="亲友留言" d="亲友可远程追思、写下寄语，共同缅怀。" />
          <Feature t="献花与点灯" d="虚拟献花、电子长明灯，思念长明。" />
          <Feature t="扫码云碑" d="二维码铭牌贴于墓碑，扫码即达纪念馆。" />
          <Feature t="家族谱系" d="家族纪念馆支持多位逝者与谱系并列。" />
        </div>
      </section>

      {/* 公开纪念馆 */}
      <section className="mt-12">
        <h2 className="mb-5 text-xl font-semibold text-brand-900">已公开的纪念空间</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((h) => (
            <Link
              key={h.id}
              href={`/halls/${h.id}`}
              className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-100">
                {h.coverImage ? (
                  <Image
                    src={h.coverImage}
                    alt={h.name}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-brand-100" />
                )}
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold text-brand-900">{h.name}</h3>
                <p className="mt-1 text-sm text-brand-500">逝者：{h.deceasedName}</p>
                {h.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                    {h.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
          {halls.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-brand-500">
              暂无公开纪念馆
            </div>
          )}
        </div>
      </section>

      {/* FAQ 引导 */}
      <section className="mt-12 rounded-2xl bg-brand-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-brand-900">
          关于纪念馆，你可能想问
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-600">
          纪念馆是否永久保存？内容是否合规？如何邀请亲友？更多问题见 FAQ。
        </p>
        <Link
          href="/faq"
          className="mt-5 inline-block text-sm font-medium text-accent-600 hover:underline"
        >
          查看常见问题 FAQ →
        </Link>
      </section>
    </div>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-5">
      <div className="mb-2 text-sm font-bold text-accent-600">第 {n} 步</div>
      <div className="font-semibold text-brand-900">{t}</div>
      <p className="mt-1 text-sm text-brand-500">{d}</p>
    </div>
  );
}

function Feature({ t, d }: { t: string; d: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
      <div className="font-semibold text-brand-900">{t}</div>
      <p className="mt-2 text-sm leading-6 text-brand-500">{d}</p>
    </div>
  );
}
