import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/app/(public)/actions";
import NavLinks from "@/components/site/NavLinks";

/**
 * 两行式页头：
 * - 顶行：左侧品牌 logo，中部品牌铭句（gold 细线 + 传统铭句，呼应纪念主题），
 *   右侧登录/注册（或 控制台/退出）独占最右，与导航栏分离；中部铭句在窄屏隐藏；
 * - 第二行：全站导航均匀铺开，当前页由 NavLinks 按真实路径做墨色高亮
 *   （「午夜悄悄话」不再永久高亮，避免误导）。
 */
export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-brand-200 bg-brand-100/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo.png"
            alt="宗忆堂商标"
            className="h-10 w-10 rounded-lg object-cover shadow-sm"
          />
          <span className="text-lg font-semibold tracking-wide text-brand-900">
            宗忆堂
          </span>
        </Link>

        {/* 顶行中部品牌铭句：填补空白，呼应纪念主题（窄屏隐藏） */}
        <div className="hidden flex-1 items-center justify-center gap-3 md:flex">
          <span
            aria-hidden="true"
            className="h-px w-10 bg-gradient-to-r from-transparent to-accent-300"
          />
          <div className="text-center leading-tight">
            <p className="font-serif text-[15px] tracking-[0.3em] text-brand-800">
              慎终追远 · 民德归厚
            </p>
            <p className="mt-0.5 text-[11px] tracking-widest text-brand-400">
              数字纪念馆 · 宗亲文化 · 云端追思
            </p>
          </div>
          <span
            aria-hidden="true"
            className="h-px w-10 bg-gradient-to-l from-transparent to-accent-300"
          />
        </div>

        {/* 登录区独占右上角，与导航栏分离 */}
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <a
                href="/console"
                className="rounded-md bg-brand-700 px-3 py-1.5 text-white hover:bg-brand-800"
              >
                {user.name || user.email || "控制台"}
              </a>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <>
              <a
                href="/login"
                className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
              >
                登录
              </a>
              <a
                href="/register"
                className="rounded-md bg-brand-700 px-3 py-1.5 text-white hover:bg-brand-800"
              >
                注册
              </a>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-brand-200/70">
        <div className="container-page hidden md:block">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}
