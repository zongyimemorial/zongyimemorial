import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClanHall } from "../actions";
import CreateFlowSteps from "@/components/site/CreateFlowSteps";

export const metadata = { title: "设立宗祠 · 宗忆堂" };

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export default async function NewClanHallPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login?from=/clan/halls/new");

  const verified = !!user.idVerified;

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
        填写宗祠的基本信息。设立<span className="font-medium text-accent-600">免费</span>，
        提交后经人工审核即对宗亲公开展示；装修素材免费的已足够端庄，精美素材可积分兑换或开通高级订阅。
      </p>

      {/*
        步骤条：把"填表只是第二步"这件事显式画出来。
        否则用户填完提交，到了装修工坊会以为"怎么还有事要做"。
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

      <form action={createClanHall} className="mt-6 space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-brand-900">宗祠名号</h2>
          <p className="mb-4 mt-1 text-xs text-brand-400">
            宗祠名称与堂号是识别宗族的标志，请按族谱记载填写。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">姓氏 *</label>
              <input
                name="surname"
                required
                maxLength={10}
                className={field}
                placeholder="如：李"
                disabled={!verified}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">宗祠名称 *</label>
              <input
                name="hallName"
                required
                maxLength={40}
                className={field}
                placeholder="如：陇西李氏宗祠"
                disabled={!verified}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">堂号 *</label>
              <input
                name="name"
                required
                maxLength={20}
                className={field}
                placeholder="如：敦本堂"
                disabled={!verified}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-brand-900">源流与始祖</h2>
          <p className="mb-4 mt-1 text-xs text-brand-400">越完整越便于宗亲溯源认领，可留空。</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">郡望 / 堂号别称</label>
              <input name="ancestorTitle" maxLength={30} className={field} placeholder="如：陇西" disabled={!verified} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">始祖</label>
              <input name="ancestorName" maxLength={20} className={field} placeholder="如：李广" disabled={!verified} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">始迁地 / 祖籍</label>
              <input name="origin" maxLength={60} className={field} placeholder="如：甘肃陇西" disabled={!verified} />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-brand-700">宗祠简介</label>
            <textarea
              name="description"
              rows={3}
              className={field}
              placeholder="简述宗祠始建年代、迁建沿革、堂号由来与主要祭祖活动。"
              disabled={!verified}
            />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-brand-700">
              字辈诗 / 派语（每行一句，也可整段粘贴）
            </label>
            <textarea
              name="generationPoem"
              rows={3}
              className={field}
              placeholder={"克明俊德，以亲九族\n平章百姓，协和万邦"}
              disabled={!verified}
            />
          </div>
        </section>

        {/* —— 宗祠基础佐证材料（标准通道） —— */}
        <section className="rounded-xl border border-gray-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-brand-900">宗祠佐证材料</h2>
          <p className="mb-4 mt-1 text-xs text-brand-400">
            依据《网络祭祀要求》（MZ/T 173—2025）及宗祠设立规范，需提供至少一项佐证。
            可填编号/说明，或上传图片（祠堂历史照片、族谱页、宗族证明等）。
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">宗族关系证明（编号 / 说明）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input name="mat_clan_relation" maxLength={200} className={field} placeholder="如：族谱记载 / 宗亲会证明编号" disabled={!verified} />
                <input type="file" name="file_clan_relation" accept="image/*" className="text-xs text-brand-500" disabled={!verified} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">族谱记载（说明）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input name="mat_genealogy_record" maxLength={200} className={field} placeholder="如：某版族谱第几卷记载" disabled={!verified} />
                <input type="file" name="file_genealogy_record" accept="image/*" className="text-xs text-brand-500" disabled={!verified} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">祠堂历史照片或证明（说明）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input name="mat_clan_history_photo" maxLength={200} className={field} placeholder="如：祠堂现状 / 文物保护单位编号" disabled={!verified} />
                <input type="file" name="file_clan_history_photo" accept="image/*" className="text-xs text-brand-500" disabled={!verified} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">经办人身份证号</label>
              <input name="applicantIdCard" maxLength={18} className={field} placeholder="18位（加密存储）" disabled={!verified} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">经办人手机号</label>
              <input name="applicantPhone" maxLength={11} className={field} placeholder="11位" disabled={!verified} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">经办人姓名（选填）</label>
              <input name="applicantRealName" maxLength={30} className={field} placeholder="与实名认证一致" disabled={!verified} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!verified}
            className="rounded-md bg-brand-800 px-7 py-2.5 text-sm text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            提交并进入装修工坊
          </button>
          <Link href="/clan/halls" className="text-sm text-brand-500 hover:text-brand-700">
            返回宗祠列表
          </Link>
        </div>
      </form>
    </div>
  );
}
