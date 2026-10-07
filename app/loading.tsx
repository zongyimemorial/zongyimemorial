// 全局加载态：软导航期间展示占位与进度提示，
// 避免隧道缓慢时页面空白被误认为“卡死/返回键无反应”。
export default function Loading() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
        <p className="text-sm text-brand-500">加载中…</p>
      </div>
    </div>
  );
}
