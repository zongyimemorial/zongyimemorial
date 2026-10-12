// 已通过口令验证时展示的过渡页。
// 注意：不做任何自动跳转（之前的 router.replace 会在“后退到门页”时
// 把用户弹回首页，形成后退陷阱——按返回键永远被弹回，表现为“无法返回”）。
// 只提供硬链接按钮，由用户决定何时返回；后退行为保持浏览器原生语义。
export default function GateAuthed() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-100 bg-brand-100/70 p-8 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-widest text-brand-400">INTERNAL TEST</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-900">您已通过验证</h1>
        <p className="mt-1 text-sm text-brand-500">可直接浏览平台各板块</p>
        <a
          href="/"
          className="mt-6 block w-full rounded-lg bg-brand-700 py-3 font-medium text-white transition hover:bg-brand-800"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}
