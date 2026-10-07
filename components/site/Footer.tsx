import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="container-page grid gap-8 py-10 md:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logo.png"
              alt="宗忆堂商标"
              className="h-9 w-9 rounded-lg object-cover"
            />
            <span className="text-base font-semibold text-brand-900">
              宗忆堂
            </span>
          </div>
          <p className="text-sm leading-6 text-brand-500">
            以数字方式留存思念，传承生命文化。本平台提供新闻资讯、数字纪念馆、云祭扫与虚拟献花服务。
          </p>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-brand-800">服务</div>
          <ul className="space-y-2 text-sm text-brand-500">
            <li>
              <Link href="/news" className="hover:text-accent-600">
                新闻资讯
              </Link>
            </li>
            <li>
              <Link href="/live" className="hover:text-accent-600">
                云直播
              </Link>
            </li>
            <li>
              <Link href="/mall" className="hover:text-accent-600">
                虚拟祭品
              </Link>
            </li>
            <li>
              <Link href="/halls" className="hover:text-accent-600">
                数字纪念馆
              </Link>
            </li>
            <li>
              <Link href="/clan" className="hover:text-accent-600">
                宗亲文化
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-brand-800">关于</div>
          <ul className="space-y-2 text-sm text-brand-500">
          <li>
            <Link href="/about" className="hover:text-accent-600">
              平台介绍
            </Link>
          </li>
          <li>
            <Link href="/faq" className="hover:text-accent-600">
              常见问题
            </Link>
          </li>
            <li>
              <Link href="/about#compliance" className="hover:text-accent-600">
                合规说明
              </Link>
            </li>
            <li>
              <Link href="/points/guide" className="hover:text-accent-600">
                积分规则详解
              </Link>
            </li>
            <li>
              <Link href="/halls/guide" className="hover:text-accent-600">
                纪念馆创建引导
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-brand-800">联系</div>
          <p className="text-sm text-brand-500">
            客服与机构合作：service@example.com
          </p>
          <p className="mt-2 text-xs text-brand-500">
            本平台为文化传播与数字纪念技术服务，不涉及线下殡葬服务经营。
          </p>
        </div>
      </div>
      <div className="border-t border-gray-100 py-4 text-center text-xs text-brand-500">
        © {new Date().getFullYear()} 宗忆堂 · 仅供数字纪念与文化交流使用
      </div>
    </footer>
  );
}
