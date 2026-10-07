import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/app/(public)/actions";

export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
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

        {/* 顶部导航统一用整页硬跳转（<a>）：隧道抖动时软导航会静默失败，
            表现为“进入板块后返回键/导航无反应”。硬跳转由浏览器原生负责，
            可重试、前进后退天然可靠。 */}
        <nav className="hidden items-center gap-5 text-[13px] text-brand-700 md:flex">
          <a href="/" className="hover:text-accent-600">
            首页
          </a>
          <a href="/halls" className="hover:text-accent-600">
            数字纪念馆
          </a>
          <a href="/clan" className="hover:text-accent-600">
            宗亲文化
          </a>
          <a href="/whispers" className="hover:text-accent-600">
            午夜悄悄话
          </a>
          <a href="/mall" className="hover:text-accent-600">
            虚拟祭品
          </a>
          <a href="/live" className="hover:text-accent-600">
            云直播
          </a>
          <a href="/news" className="hover:text-accent-600">
            新闻资讯
          </a>
          <a href="/gallery/decor" className="hover:text-accent-600">
            装修案例
          </a>
          <a href="/festivals" className="hover:text-accent-600">
            追思节日
          </a>
          <a href="/points" className="hover:text-accent-600">
            积分兑换
          </a>
          <a href="/faq" className="hover:text-accent-600">
            常见问题
          </a>
        </nav>

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
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <>
              <a
                href="/login"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
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
    </header>
  );
}
